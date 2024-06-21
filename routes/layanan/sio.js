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
        const uploadPath = path.join('uploads/sio');

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

router.post('/upload-Sio', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_pengajuan_lks' },
    { name: 'akta_notaris_pendirian' },
    { name: 'adart' },
    { name: 'struktur_organisasi' },
    { name: 'suket_domisili' },
    { name: 'biodata' },
    { name: 'proker' },
    { name: 'npwp' },
    { name: 'skt' },
]), async (req, res) => {
    const { user_nik } = req.body;

    // Mengecek apakah semua file diunggah
    const requiredFields = ['ktp', 'surat_permohonan_pengajuan_lks', 'akta_notaris_pendirian', 'adart', 'struktur_organisasi', 'suket_domisili', 'biodata', 'proker', 'npwp', 'skt'];
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
            'SELECT COUNT(*) as count FROM lay_sio WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `SIO${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_sio WHERE no_lay = ?',
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
            'INSERT INTO lay_sio (no_lay, user_nik, ktp, surat_permohonan_pengajuan_lks, akta_notaris_pendirian, adart, struktur_organisasi, suket_domisili, biodata, proker, npwp, skt, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.surat_permohonan_pengajuan_lks),
                JSON.stringify(filePaths.akta_notaris_pendirian),
                JSON.stringify(filePaths.adart),
                JSON.stringify(filePaths.struktur_organisasi),
                JSON.stringify(filePaths.suket_domisili),
                JSON.stringify(filePaths.biodata),
                JSON.stringify(filePaths.proker),
                JSON.stringify(filePaths.npwp),
                JSON.stringify(filePaths.skt)
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});


router.get('/lay-SIO', async (req, res) => {
    const { user_nik } = req.query;

    try {
        const [rows] = await db.execute(
            'SELECT id, no_lay, user_nik, ktp, surat_permohonan_pengajuan_lks, akta_notaris_pendirian, adart, struktur_organisasi, suket_domisili, biodata, proker, npwp, skt, submit_at, valid_at, reject_at, accept_at FROM lay_sio WHERE user_nik = ?',
            [user_nik]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// Rute untuk mengambil data berdasarkan nomor pelayanan (nopel)
router.get('/lay-SIO/:nopel', authenticateUser, async (req, res) => {
    const { nopel } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_sio WHERE no_lay = ?',
            [nopel]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const sio = rows[0];
        const userId = sio.user_nik;

        const [userRows] = await db.execute(
            'SELECT * FROM users WHERE nik = ?',
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = userRows[0];

        const responseData = {
            ...sio,
            user: user
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});



router.put('/update-SIO/:no_lay', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_pengajuan_lks' },
    { name: 'akta_notaris_pendirian' },
    { name: 'adart' },
    { name: 'struktur_organisasi' },
    { name: 'suket_domisili' },
    { name: 'biodata' },
    { name: 'proker' },
    { name: 'npwp' },
    { name: 'skt' },
    { name: 'product' },
]), async (req, res) => {
    const { no_lay } = req.params;
    const { valid_at, reject_at, accept_at, reason } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_sio WHERE no_lay = ?',
            [no_lay]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        // Membuat objek untuk menyimpan jalur file yang diperbarui
        const updateFields = {};
        if (req.files && req.files.ktp) updateFields.ktp = JSON.stringify([req.files.ktp[0].path]);
        if (req.files && req.files.surat_permohonan_pengajuan_lks) updateFields.surat_permohonan_pengajuan_lks = JSON.stringify([req.files.surat_permohonan_pengajuan_lks[0].path]);
        if (req.files && req.files.akta_notaris_pendirian) updateFields.akta_notaris_pendirian = JSON.stringify([req.files.akta_notaris_pendirian[0].path]);
        if (req.files && req.files.adart) updateFields.adart = JSON.stringify([req.files.adart[0].path]);
        if (req.files && req.files.struktur_organisasi) updateFields.struktur_organisasi = JSON.stringify([req.files.struktur_organisasi[0].path]);
        if (req.files && req.files.suket_domisili) updateFields.suket_domisili = JSON.stringify([req.files.suket_domisili[0].path]);
        if (req.files && req.files.biodata) updateFields.biodata = JSON.stringify([req.files.biodata[0].path]);
        if (req.files && req.files.proker) updateFields.proker = JSON.stringify([req.files.proker[0].path]);
        if (req.files && req.files.npwp) updateFields.npwp = JSON.stringify([req.files.npwp[0].path]);
        if (req.files && req.files.skt) updateFields.skt = JSON.stringify([req.files.skt[0].path]);
        if (req.files && req.files.product) updateFields.product = JSON.stringify([req.files.product[0].path]);
        if (valid_at) updateFields.valid_at = valid_at;
        if (reject_at) updateFields.reject_at = reject_at;
        if (accept_at) updateFields.accept_at = accept_at;
        if (reason) updateFields.reason = reason;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE lay_sio SET ${queryFields} WHERE no_lay = ?`,
            [...queryValues, no_lay]
        );

        if (Object.keys(updateFields).length > 0) {
            const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
            const queryValues = Object.values(updateFields);

            await db.execute(
                `UPDATE lay_sio SET ${queryFields} WHERE no_lay = ?`,
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




router.delete('/delete-SIO/:no_lay', authenticateUser, async (req, res) => {
    const { no_lay } = req.params;
    const user_nik = req.user.id;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM lay_sio WHERE no_lay = ? AND user_nik = ?',
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
        if (data.surat_permohonan_pengajuan_lks && fs.existsSync(data.surat_permohonan_pengajuan_lks)) {
            fs.unlinkSync(data.surat_permohonan_pengajuan_lks);
        }
        if (data.akta_notaris_pendirian && fs.existsSync(data.akta_notaris_pendirian)) {
            fs.unlinkSync(data.akta_notaris_pendirian);
        }
        if (data.adart && fs.existsSync(data.adart)) {
            fs.unlinkSync(data.adart);
        }
        if (data.struktur_organisasi && fs.existsSync(data.struktur_organisasi)) {
            fs.unlinkSync(data.struktur_organisasi);
        }
        if (data.suket_domisili && fs.existsSync(data.suket_domisili)) {
            fs.unlinkSync(data.suket_domisili);
        }
        if (data.biodata && fs.existsSync(data.biodata)) {
            fs.unlinkSync(data.biodata);
        }
        if (data.proker && fs.existsSync(data.proker)) {
            fs.unlinkSync(data.proker);
        }
        if (data.npwp && fs.existsSync(data.npwp)) {
            fs.unlinkSync(data.npwp);
        }
        if (data.skt && fs.existsSync(data.skt)) {
            fs.unlinkSync(data.skt);
        }

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM lay_sio WHERE no_lay = ? AND user_nik = ?',
            [no_lay, user_nik]
        );

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});


// ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN

router.get('/all-lay-SIO', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT lay_sio.*, users.nik, users.full_name AS nama 
            FROM lay_sio 
            JOIN users ON lay_sio.user_nik = users.nik`
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.post('/admin-upload-SIO', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_pengajuan_lks' },
    { name: 'akta_notaris_pendirian' },
    { name: 'adart' },
    { name: 'struktur_organisasi' },
    { name: 'suket_domisili' },
    { name: 'biodata' },
    { name: 'proker' },
    { name: 'npwp' },
    { name: 'skt' },
]), async (req, res) => {
    const { NIK } = req.body;

    try {
        const user_nik = NIK;

        // Mengecek apakah semua file diunggah
        const requiredFields = ['ktp', 'surat_permohonan_pengajuan_lks', 'akta_notaris_pendirian', 'adart', 'struktur_organisasi', 'suket_domisili', 'biodata', 'proker', 'npwp', 'skt'];
        for (const field of requiredFields) {
            if (!req.files[field]) {
                return res.status(400).json({ message: `${field} diperlukan` });
            }
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_sio WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `SIO${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_sio WHERE no_lay = ?',
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
            'INSERT INTO lay_sio (no_lay, user_nik, ktp, surat_permohonan_pengajuan_lks, akta_notaris_pendirian, adart, struktur_organisasi, suket_domisili, biodata, proker, npwp, skt, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.surat_permohonan_pengajuan_lks),
                JSON.stringify(filePaths.akta_notaris_pendirian),
                JSON.stringify(filePaths.adart),
                JSON.stringify(filePaths.struktur_organisasi),
                JSON.stringify(filePaths.suket_domisili),
                JSON.stringify(filePaths.biodata),
                JSON.stringify(filePaths.proker),
                JSON.stringify(filePaths.npwp),
                JSON.stringify(filePaths.skt),
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




// router.get('/download-file/:table/:id/:type', async (req, res) => {
//     const { table, id, type } = req.params;

//     try {
//         // Ambil data dari database
//         const [rows] = await db.execute(
//             `SELECT ${type} FROM ${table} WHERE id = ?`,
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

    
// router.put('/update-Skt/:no_lay', authenticateUser, upload.fields([
//     { name: 'ktp', maxCount: 1 },
//     { name: 'surat_permohonan_pengajuan_lks', maxCount: 1 },
//     { name: 'akta_notaris_pendirian', maxCount: 1 },
//     { name: 'adart', maxCount: 1 },
//     { name: 'struktur_organisasi', maxCount: 1 },
//     { name: 'suket_domisili', maxCount: 1 },
//     { name: 'biodata', maxCount: 1 },
//     { name: 'proker', maxCount: 1 },
//     { name: 'npwp', maxCount: 1 },
// ]), async (req, res) => {
//     const { no_lay } = req.params;
//     const user_nik = req.user.id;
//     const { jml_tedampak } = req.body;

//     try {
//         const [rows] = await db.execute(
//             'SELECT * FROM lay_sio WHERE no_lay = ? AND user_nik = ?',
//             [no_lay, user_nik]
//         );

//         if (rows.length === 0) {
//             return res.status(404).json({ message: 'Data not found' });
//         }

//         const updateFields = {};
//         if (req.files.ktp) updateFields.ktp = req.files.ktp[0].path;
//         if (req.files.surat_permohonan_pengajuan_lks) updateFields.surat_permohonan_pengajuan_lks = req.files.surat_permohonan_pengajuan_lks[0].path;
//         if (req.files.akta_notaris_pendirian) updateFields.akta_notaris_pendirian = req.files.akta_notaris_pendirian[0].path;
//         if (req.files.adart) updateFields.adart = req.files.adart[0].path;
//         if (req.files.struktur_organisasi) updateFields.struktur_organisasi = req.files.struktur_organisasi[0].path;
//         if (req.files.suket_domisili) updateFields.suket_domisili = req.files.suket_domisili[0].path;
//         if (req.files.biodata) updateFields.biodata = req.files.biodata[0].path;
//         if (req.files.proker) updateFields.proker = req.files.proker[0].path;
//         if (req.files.npwp) updateFields.npwp = req.files.npwp[0].path;

//         // Check if there are fields to update
//         if (Object.keys(updateFields).length === 0) {
//             return res.status(400).json({ message: 'No fields to update' });
//         }

//         const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
//         const queryValues = Object.values(updateFields);

//         await db.execute(
//             `UPDATE lay_sio SET ${queryFields} WHERE no_lay = ? AND user_nik = ?`,
//             [...queryValues, no_lay, user_nik]
//         );

//         res.status(200).json({ message: 'Data updated successfully', ...updateFields });
//     } catch (error) {
//         console.error('Database error:', error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });