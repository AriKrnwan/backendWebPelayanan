const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../config/db');
const authenticateUser = require('../../middleware/authenticateUser'); // Pastikan jalur ini benar
const AdmZip = require('adm-zip');
const archiver = require('archiver');

const router = express.Router();

// Konfigurasi penyimpanan untuk multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join('uploads/santunan-kematian');

        // Periksa apakah direktori ada, jika tidak buat direktori tersebut
        fs.mkdir(uploadPath, { recursive: true }, (err) => {
            if (err) {
                console.error('Gagal membuat direktori', err);
                return cb(err);
            }
            cb(null, uploadPath);
        });
    },
    filename: function (req, file, cb) {
        const originalName = file.originalname.replace(/\s+/g, '_'); // Ganti spasi dengan underscores
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

        // Ambil 10 angka terakhir dari nomor unik
        const shortUniqueSuffix = String(uniqueSuffix).slice(-10);

        // Gabungkan nama original dengan 10 angka terakhir nomor unik
        const finalFileName = shortUniqueSuffix + '-' + originalName;

        cb(null, finalFileName);
    }
});




const upload = multer({ storage: storage });

router.post('/upload-Santunan-Kematian', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_santunan_kematian' },
    { name: 'akta_kematian' },
    { name: 'suket_ahli_waris' },
    { name: 'sktm' },
    { name: 'kk' },
    { name: 'rekening' },
]), async (req, res) => {
    const { user_nik } = req.body;

    // Mengecek apakah semua file diunggah
    const requiredFields = ['ktp', 'surat_permohonan_santunan_kematian', 'akta_kematian', 'suket_ahli_waris', 'sktm', 'kk', 'rekening'];
    for (const field of requiredFields) {
        if (!req.files[field]) {
            return res.status(400).json({ message: `${field} diperlukan` });
        }
    }

    const date = new Date();
    const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD

    try {
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_santunan_kematian WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `STK${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_santunan_kematian WHERE no_lay = ?',
                [no_lay]
            );

            if (existingNoLay[0].count === 0) {
                isUnique = true; // no_lay is unique
            } else {
                count++; // increment count and try again
            }
        }

        // Membuat objek untuk menyimpan jalur file
        const filePaths = {};
        for (const field of requiredFields) {
            filePaths[field] = req.files[field].map(file => file.path);
        }

        const [result] = await db.execute(
            'INSERT INTO lay_santunan_kematian (no_lay, user_nik, ktp, surat_permohonan_santunan_kematian, akta_kematian, suket_ahli_waris, sktm, kk, rekening, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.surat_permohonan_santunan_kematian),
                JSON.stringify(filePaths.akta_kematian),
                JSON.stringify(filePaths.suket_ahli_waris),
                JSON.stringify(filePaths.sktm),
                JSON.stringify(filePaths.kk),
                JSON.stringify(filePaths.rekening)
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});


router.get('/lay-santunan-kematian', async (req, res) => {
    const { user_nik } = req.query;

    try {
        const [rows] = await db.execute(
            'SELECT id, no_lay, user_nik, ktp, surat_permohonan_santunan_kematian, akta_kematian, suket_ahli_waris, sktm, kk, rekening, submit_at, valid_at, reject_at, accept_at FROM lay_santunan_kematian WHERE user_nik = ?',
            [user_nik]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// Rute untuk mengambil data berdasarkan nomor pelayanan (nopel)
router.get('/lay-santunan-kematian/:nopel', authenticateUser, async (req, res) => {
    const { nopel } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_santunan_kematian WHERE no_lay = ?',
            [nopel]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const santunanKematian = rows[0];
        const userId = santunanKematian.user_nik;

        const [userRows] = await db.execute(
            'SELECT * FROM users WHERE nik = ?',
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = userRows[0];

        // Gabungkan data bantuan logistik dan data user
        const responseData = {
            ...santunanKematian,
            user: user
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.put('/update-santunan-kematian/:no_lay', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_santunan_kematian' },
    { name: 'akta_kematian' },
    { name: 'suket_ahli_waris' },
    { name: 'sktm' },
    { name: 'kk' },
    { name: 'rekening' },
    { name: 'product' }
]), async (req, res) => {
    const { no_lay } = req.params;
    const { valid_at, reject_at, accept_at, reason } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_santunan_kematian WHERE no_lay = ?',
            [no_lay]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const updateFields = {};
        if (req.files && req.files.ktp) updateFields.ktp = JSON.stringify([req.files.ktp[0].path]);
        if (req.files && req.files.surat_permohonan_santunan_kematian) updateFields.surat_permohonan_santunan_kematian = JSON.stringify([req.files.surat_permohonan_santunan_kematian[0].path]);
        if (req.files && req.files.akta_kematian) updateFields.akta_kematian = JSON.stringify([req.files.akta_kematian[0].path]);
        if (req.files && req.files.suket_ahli_waris) updateFields.suket_ahli_waris = JSON.stringify([req.files.suket_ahli_waris[0].path]);
        if (req.files && req.files.sktm) updateFields.sktm = JSON.stringify([req.files.sktm[0].path]);
        if (req.files && req.files.kk) updateFields.kk = JSON.stringify([req.files.kk[0].path]);
        if (req.files && req.files.rekening) updateFields.rekening = JSON.stringify([req.files.rekening[0].path]);
        if (req.files && req.files.product) updateFields.product = JSON.stringify([req.files.product[0].path]);
        if (valid_at) updateFields.valid_at = valid_at;
        if (reject_at) updateFields.reject_at = reject_at;
        if (accept_at) updateFields.accept_at = accept_at;
        if (reason) updateFields.reason = reason;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE lay_santunan_kematian SET ${queryFields} WHERE no_lay = ?`,
            [...queryValues, no_lay]
        );

        if (Object.keys(updateFields).length > 0) {
            const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
            const queryValues = Object.values(updateFields);

            await db.execute(
                `UPDATE lay_santunan_kematian SET ${queryFields} WHERE no_lay = ?`,
                [...queryValues, no_lay]
            );

            res.status(200).json({ message: 'Data updated successfully', ...updateFields });
        } else {
            res.status(400).json({ message: 'No fields to update' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});

router.delete('/delete-santunan-kematian/:no_lay', authenticateUser, async (req, res) => {
    const { no_lay } = req.params;
    const user_nik = req.user.id;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM lay_santunan_kematian WHERE no_lay = ? AND user_nik = ?',
            [no_lay, user_nik]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const data = rows[0];

        // Hapus file terkait jika ada
        if (data.ktp && fs.existsSync(data.ktp)) {
            fs.unlinkSync(data.ktp);
        }
        if (data.surat_permohonan_santunan_kematian && fs.existsSync(data.surat_permohonan_santunan_kematian)) {
            fs.unlinkSync(data.surat_permohonan_santunan_kematian);
        }
        if (data.akta_kematian && fs.existsSync(data.akta_kematian)) {
            fs.unlinkSync(data.akta_kematian);
        }
        if (data.suket_ahli_waris && fs.existsSync(data.suket_ahli_waris)) {
            fs.unlinkSync(data.suket_ahli_waris);
        }
        if (data.sktm && fs.existsSync(data.sktm)) {
            fs.unlinkSync(data.sktm);
        }
        if (data.kk && fs.existsSync(data.kk)) {
            fs.unlinkSync(data.kk);
        }
        if (data.rekening && fs.existsSync(data.rekening)) {
            fs.unlinkSync(data.rekening);
        }

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM lay_santunan_kematian WHERE no_lay = ? AND user_nik = ?',
            [no_lay, user_nik]
        );

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN

router.get('/all-lay-santunan-kematian', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT lay_santunan_kematian.*, users.nik, users.full_name AS nama 
            FROM lay_santunan_kematian 
            JOIN users ON lay_santunan_kematian.user_nik = users.nik`
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.post('/admin-upload-santunan-kematian', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_santunan_kematian' },
    { name: 'akta_kematian' },
    { name: 'suket_ahli_waris' },
    { name: 'sktm' },
    { name: 'kk' },
    { name: 'rekening' },
]), async (req, res) => {
    const { NIK } = req.body;

    try {
        const user_nik = NIK;

        // Mengecek apakah semua file diunggah
        const requiredFields = ['ktp', 'surat_permohonan_santunan_kematian', 'akta_kematian', 'suket_ahli_waris', 'sktm', 'kk', 'rekening'];
        for (const field of requiredFields) {
            if (!req.files[field]) {
                return res.status(400).json({ message: `${field} diperlukan` });
            }
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_santunan_kematian WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `STK${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_santunan_kematian WHERE no_lay = ?',
                [no_lay]
            );

            if (existingNoLay[0].count === 0) {
                isUnique = true; // no_lay is unique
                } else {
                    count++; // increment count and try again
            }
        }

        // Membuat objek untuk menyimpan jalur file relatif dari 'uploads'
        const filePaths = {};
        for (const field of requiredFields) {
            filePaths[field] = req.files[field].map(file => file.path);
        }

        const [result] = await db.execute(
            'INSERT INTO lay_santunan_kematian (no_lay, user_nik, ktp, surat_permohonan_santunan_kematian, akta_kematian, suket_ahli_waris, sktm, kk, rekening, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.surat_permohonan_santunan_kematian),
                JSON.stringify(filePaths.akta_kematian),
                JSON.stringify(filePaths.suket_ahli_waris),
                JSON.stringify(filePaths.sktm),
                JSON.stringify(filePaths.kk),
                JSON.stringify(filePaths.rekening),
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});







module.exports = router;






// router.get('/download/:userId/:fileName', (req, res) => {
//     const userId = req.params.userId;
//     const fileName = req.params.fileName;
//     const filePath = path.join('uploads', 'skt', userId.toString(), fileName);

//     // Cek apakah file ada
//     if (fs.existsSync(filePath)) {
//         // Kirim file sebagai respons
//         res.sendFile(filePath);
//     } else {
//         res.status(404).send('File not found');
//     }
// });




// router.get('/download-file/:id/:type', async (req, res) => {
//     const { id, type } = req.params;

//     try {
//         // Ambil data dari database
//         const [rows] = await db.execute(
//             `SELECT ${type} FROM lay_santunan_kematian WHERE id = ?`,
//             [id]
//         );

//         if (!rows.length) {
//             return res.status(404).json({ error: 'Data tidak ditemukan' });
//         }

//         const rawData = rows[0][type];
//         console.log('Data dari database:', rawData);

//         let dataType;
//         try {
//             dataType = JSON.parse(rawData);
//         } catch (parseError) {
//             console.error('Kesalahan saat parsing JSON:', parseError);
//             return res.status(500).json({ error: 'Data tidak valid' });
//         }

//         // Set up the zip stream
//         const archive = archiver('zip', {
//             zlib: { level: 9 } // Level kompresi
//         });

//         // Dengarkan kesalahan pada arsip
//         archive.on('error', (err) => {
//             console.error('Kesalahan saat membuat arsip:', err);
//             res.status(500).json({ error: 'Kesalahan saat membuat arsip' });
//         });

//         // Setel header respon
//         res.attachment('files.zip');

//         // Pipe data arsip ke respon
//         archive.pipe(res);

//         // Tambahkan file ke arsip
//         dataType.forEach(element => {
//             const absolutePath = path.join('', element);
//             console.log('Menambahkan file ke arsip:', absolutePath);
//             if (fs.existsSync(absolutePath)) {
//                 archive.file(absolutePath, { name: path.basename(absolutePath) });
//             } else {
//                 console.error('File tidak ditemukan:', absolutePath);
//             }
//         });

//         // Selesaikan arsip (tidak ada file lagi yang akan ditambahkan)
//         await archive.finalize();
//         console.log('Proses pengarsipan selesai');
        
//     } catch (error) {
//         console.error('Kesalahan:', error);
//         res.status(500).json({ error: 'Kesalahan Internal Server' });
//     }
// });

    //     if (fs.existsSync(absolutePath)) {
    //     } else {
    //         res.status(404).json({ error: 'File not found' });
    //     }

    // res.status(200).json({
    //     msg: "Data path " + type,
    //     path: dataType[0]
    // })