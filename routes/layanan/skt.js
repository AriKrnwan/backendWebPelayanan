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
        const uploadPath = path.join('uploads/skt');

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

        const finalFileNameWithoutDash = finalFileName.startsWith('-') ? finalFileName.substring(1) : finalFileName;

        cb(null, finalFileNameWithoutDash);
    }
});




const upload = multer({ storage: storage });

router.post('/upload-Skt', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_pengajuan_lks' },
    { name: 'akta_notaris_pendirian' },
    { name: 'adart' },
    { name: 'struktur_organisasi' },
    { name: 'suket_domisili' },
    { name: 'biodata' },
    { name: 'proker' },
    { name: 'npwp' },
]), async (req, res) => {
    const { user_nik } = req.body;

    // Mengecek apakah semua file diunggah
    const requiredFields = ['ktp', 'surat_permohonan_pengajuan_lks', 'akta_notaris_pendirian', 'adart', 'struktur_organisasi', 'suket_domisili', 'biodata', 'proker', 'npwp'];
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
            'SELECT COUNT(*) as count FROM lay_skt WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `SKT${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_skt WHERE no_lay = ?',
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
            'INSERT INTO lay_skt (no_lay, user_nik, ktp, surat_permohonan_pengajuan_lks, akta_notaris_pendirian, adart, struktur_organisasi, suket_domisili, biodata, proker, npwp, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
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
                JSON.stringify(filePaths.npwp)
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});


router.get('/lay-SKT', async (req, res) => {
    const { user_nik } = req.query;

    try {
        const [rows] = await db.execute(
            'SELECT id, no_lay, user_nik, ktp, surat_permohonan_pengajuan_lks, akta_notaris_pendirian, adart, struktur_organisasi, suket_domisili, biodata, proker, npwp, submit_at, valid_at, reject_at, accept_at FROM lay_skt WHERE user_nik = ?',
            [user_nik]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// Rute untuk mengambil data berdasarkan nomor pelayanan (nopel)
router.get('/lay-SKT/:nopel', authenticateUser, async (req, res) => {
    const { nopel } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_skt WHERE no_lay = ?',
            [nopel]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const skt = rows[0];
        const userId = skt.user_nik;

        const [userRows] = await db.execute(
            'SELECT * FROM users WHERE nik = ?',
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = userRows[0];

        const responseData = {
            ...skt,
            user: user
        };

        console.log(responseData)

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.put('/update-SKT/:no_lay', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_pengajuan_lks' },
    { name: 'akta_notaris_pendirian' },
    { name: 'adart' },
    { name: 'struktur_organisasi' },
    { name: 'suket_domisili' },
    { name: 'biodata' },
    { name: 'proker' },
    { name: 'npwp' },
    { name: 'product' },
]), async (req, res) => {
    const { no_lay } = req.params;
    const { valid_at, reject_at, accept_at, reason } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_skt WHERE no_lay = ?',
            [no_lay]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        // Membuat objek untuk menyimpan jalur file yang diperbarui
        const updateFields = {};

        const collectFilePaths = (fieldName) => {
            return (req.files && req.files[fieldName]) ? JSON.stringify(req.files[fieldName].map(file => file.path)) : null;
        };

        if (req.files && req.files.ktp) updateFields.ktp = collectFilePaths('ktp');
        if (req.files && req.files.surat_permohonan_pengajuan_lks) updateFields.surat_permohonan_pengajuan_lks = collectFilePaths('surat_permohonan_pengajuan_lks');
        if (req.files && req.files.akta_notaris_pendirian) updateFields.akta_notaris_pendirian = collectFilePaths('akta_notaris_pendirian');
        if (req.files && req.files.adart) updateFields.adart = collectFilePaths('adart');
        if (req.files && req.files.struktur_organisasi) updateFields.struktur_organisasi = collectFilePaths('struktur_organisasi');
        if (req.files && req.files.suket_domisili) updateFields.suket_domisili = collectFilePaths('suket_domisili');
        if (req.files && req.files.biodata) updateFields.biodata = collectFilePaths('biodata');
        if (req.files && req.files.proker) updateFields.proker = collectFilePaths('proker');
        if (req.files && req.files.npwp) updateFields.npwp = collectFilePaths('npwp');
        if (req.files && req.files.product) updateFields.product = collectFilePaths('product');

        if (valid_at) updateFields.valid_at = valid_at;
        if (reject_at) updateFields.reject_at = reject_at;
        if (accept_at) updateFields.accept_at = accept_at;
        if (reason) updateFields.reason = reason;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE lay_skt SET ${queryFields} WHERE no_lay = ?`,
            [...queryValues, no_lay]
        );

        if (Object.keys(updateFields).length > 0) {
            res.status(200).json({ message: 'Data updated successfully', ...updateFields });
        } else {
            res.status(400).json({ message: 'No fields to update' });
        }
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});




router.delete('/delete-SKT/:no_lay', authenticateUser, async (req, res) => {
    const { no_lay } = req.params;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM lay_skt WHERE no_lay = ?',
            [no_lay]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const data = rows[0];

        const deleteFiles = (filePaths) => {
            JSON.parse(filePaths || '[]').forEach(filePath => {
                const resolvedPath = path.resolve(filePath);
                if (fs.existsSync(resolvedPath)) {
                    try {
                        fs.unlinkSync(resolvedPath);
                    } catch (err) {
                        console.error(`Failed to delete file: ${resolvedPath}`, err);
                    }
                } else {
                    console.log(`File does not exist: ${resolvedPath}`);
                }
            });
        };

        // Hapus file terkait jika ada
        deleteFiles(data.ktp);
        deleteFiles(data.surat_permohonan_pengajuan_lks);
        deleteFiles(data.akta_notaris_pendirian);
        deleteFiles(data.adart);
        deleteFiles(data.struktur_organisasi);
        deleteFiles(data.suket_domisili);
        deleteFiles(data.biodata);
        deleteFiles(data.proker);
        deleteFiles(data.npwp);

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM lay_skt WHERE no_lay = ?',
            [no_lay]
        );

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});


// ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN

router.get('/all-lay-SKT', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT lay_skt.id AS lay_id, lay_skt.*, users.*
            FROM lay_skt 
            JOIN users ON lay_skt.user_nik = users.nik`
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.post('/admin-upload-SKT', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_pengajuan_lks' },
    { name: 'akta_notaris_pendirian' },
    { name: 'adart' },
    { name: 'struktur_organisasi' },
    { name: 'suket_domisili' },
    { name: 'biodata' },
    { name: 'proker' },
    { name: 'npwp' },
]), async (req, res) => {
    const { NIK } = req.body;

    try {
        const user_nik = NIK;

        // Mengecek apakah semua file diunggah
        const requiredFields = ['ktp', 'surat_permohonan_pengajuan_lks', 'akta_notaris_pendirian', 'adart', 'struktur_organisasi', 'suket_domisili', 'biodata', 'proker', 'npwp'];
        for (const field of requiredFields) {
            if (!req.files[field]) {
                return res.status(400).json({ message: `${field} diperlukan` });
            }
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_skt WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `SKT${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_skt WHERE no_lay = ?',
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
            'INSERT INTO lay_skt (no_lay, user_nik, ktp, surat_permohonan_pengajuan_lks, akta_notaris_pendirian, adart, struktur_organisasi, suket_domisili, biodata, proker, npwp, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
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
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});

router.get('/count-pengajuan/:month/:year', authenticateUser, async (req, res) => {
    const { month, year } = req.params;
    try {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM lay_bantuan_logistik WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_bantuan_logistik,
                (SELECT COUNT(*) FROM lay_dtks WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_DTKS,
                (SELECT COUNT(*) FROM lay_pbijk WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_PBI_JK,
                (SELECT COUNT(*) FROM lay_angkat_anak WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_pengangkatan_anak,
                (SELECT COUNT(*) FROM lay_penyandang_disabilitas WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_penyandang_disabilitas,
                (SELECT COUNT(*) FROM lay_pub WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_pengumpulan_uang_dan_barang,
                (SELECT COUNT(*) FROM lay_rehab_anak WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_rehabilitasi_anak_terlantar,
                (SELECT COUNT(*) FROM lay_rehab_lansia WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_rehabilitasi_lansia,
                (SELECT COUNT(*) FROM lay_rumah_singgah WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_rumah_singgah,
                (SELECT COUNT(*) FROM lay_santunan_kematian WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_santunan_kematian,
                (SELECT COUNT(*) FROM lay_sio WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_SIO,
                (SELECT COUNT(*) FROM lay_skt WHERE MONTH(submit_at) = ? AND YEAR(submit_at) = ?) as count_lay_SKT
        `;
        const params = [
            month, year, month, year, month, year, month, year, month, year, month, year, 
            month, year, month, year, month, year, month, year, month, year, month, year
        ];
        const [rows] = await db.execute(query, params);
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
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
//     const  = req.user.id;
//     const { jml_tedampak } = req.body;

//     try {
//         const [rows] = await db.execute(
//             'SELECT * FROM lay_skt WHERE no_lay = ? AND user_nik = ?',
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
//             `UPDATE lay_skt SET ${queryFields} WHERE no_lay = ? AND user_nik = ?`,
//             [...queryValues, no_lay, user_nik]
//         );

//         res.status(200).json({ message: 'Data updated successfully', ...updateFields });
//     } catch (error) {
//         console.error('Database error:', error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });