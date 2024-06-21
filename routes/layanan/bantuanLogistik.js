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
        const uploadPath = path.join('uploads/bantuan-logistik');

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

// POST
router.post('/upload-Bantuan-Logistik', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_bantuan_logistik' },
    { name: 'dokumentasi_bencana' }
]), async (req, res) => {
    const { jml_tedampak, user_nik } = req.body;

    if (!user_nik) {
        return res.status(400).json({ message: 'User NIK is required' });
    }

    // Mengecek apakah semua file diunggah
    const requiredFields = ['ktp', 'surat_permohonan_bantuan_logistik', 'dokumentasi_bencana'];
    for (const field of requiredFields) {
        if (!req.files[field]) {
            return res.status(400).json({ message: `${field} diperlukan` });
        }
    }

    // Pastikan `jml_tedampak` ada dan tidak undefined
    if (!jml_tedampak) {
        return res.status(400).json({ message: 'Jumlah terdampak diperlukan' });
    }

    const date = new Date();
    const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD

    try {
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_bantuan_logistik WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `BTL${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_bantuan_logistik WHERE no_lay = ?',
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
            'INSERT INTO lay_bantuan_logistik (no_lay, user_nik, ktp, surat_permohonan_bantuan_logistik, dokumentasi_bencana, jml_tedampak, submit_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.surat_permohonan_bantuan_logistik),
                JSON.stringify(filePaths.dokumentasi_bencana),
                jml_tedampak
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});

// GET ALL BERDASARKAN ID YANG LOGIN
router.get('/lay-bantuan-logistik', async (req, res) => {
    const { user_nik } = req.query;

    try {
        const [rows] = await db.execute(
            'SELECT id, no_lay, user_nik, ktp, surat_permohonan_bantuan_logistik, dokumentasi_bencana, jml_tedampak, submit_at, valid_at, reject_at, accept_at FROM lay_bantuan_logistik WHERE user_nik = ?',
            [user_nik]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// GET BERDASATKAN NOPEL
router.get('/lay-bantuan-logistik/:nopel', authenticateUser, async (req, res) => {
    const { nopel } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ?',
            [nopel]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const bantuanLogistik = rows[0];
        const userId = bantuanLogistik.user_nik;

        // Query untuk mendapatkan data user
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
            ...bantuanLogistik,
            user: user
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// UPDATE
router.put('/update-bantuan-logistik/:no_lay', authenticateUser, upload.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'surat_permohonan_bantuan_logistik', maxCount: 1 },
    { name: 'dokumentasi_bencana', maxCount: 1 },
    { name: 'product', maxCount: 1 }
]), async (req, res) => {
    const { no_lay } = req.params;
    const { jml_tedampak, valid_at, reject_at, accept_at, reason } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ?',
            [no_lay]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const updateFields = {};
        if (req.files && req.files.ktp) updateFields.ktp = JSON.stringify([req.files.ktp[0].path]);
        if (req.files && req.files.surat_permohonan_bantuan_logistik) updateFields.surat_permohonan_bantuan_logistik = JSON.stringify([req.files.surat_permohonan_bantuan_logistik[0].path]);
        if (req.files && req.files.dokumentasi_bencana) updateFields.dokumentasi_bencana = JSON.stringify([req.files.dokumentasi_bencana[0].path]);
        if (req.files && req.files.product) updateFields.product = JSON.stringify([req.files.product[0].path]);
        if (jml_tedampak) updateFields.jml_tedampak = jml_tedampak;
        if (valid_at) updateFields.valid_at = valid_at;
        if (reject_at) updateFields.reject_at = reject_at;
        if (accept_at) updateFields.accept_at = accept_at;
        if (reason) updateFields.reason = reason;
        // if (product) updateFields.product = product;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE lay_bantuan_logistik SET ${queryFields} WHERE no_lay = ?`,
            [...queryValues, no_lay]
        );

        if (Object.keys(updateFields).length > 0) {
            const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
            const queryValues = Object.values(updateFields);

            await db.execute(
                `UPDATE lay_bantuan_logistik SET ${queryFields} WHERE no_lay = ?`,
                [...queryValues, no_lay]
            );

            res.status(200).json({ message: 'Data updated successfully', ...updateFields });
        } else {
            res.status(400).json({ message: 'No fields to update' });
        }

    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// DELETE
router.delete('/delete-bantuan-logistik/:no_lay', authenticateUser, async (req, res) => {
    const { no_lay } = req.params;
    const user_nik = req.user.id;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ? AND user_nik = ?',
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
        if (data.surat_permohonan_bantuan_logistik && fs.existsSync(data.surat_permohonan_bantuan_logistik)) {
            fs.unlinkSync(data.surat_permohonan_bantuan_logistik);
        }
        if (data.dokumentasi_bencana && fs.existsSync(data.dokumentasi_bencana)) {
            fs.unlinkSync(data.dokumentasi_bencana);
        }
        if (data.jml_tedampak && fs.existsSync(data.jml_tedampak)) {
            fs.unlinkSync(data.jml_tedampak);
        }

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM lay_bantuan_logistik WHERE no_lay = ? AND user_nik = ?',
            [no_lay, user_nik]
        );

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// FOR ADMIN
// FOR ADMIN
// FOR ADMIN


// Endpoint to get all data from lay_bantuan_logistik and corresponding user data
router.get('/all-lay-bantuan-logistik', authenticateUser, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT lay_bantuan_logistik.*, users.nik, users.full_name AS nama 
            FROM lay_bantuan_logistik 
            JOIN users ON lay_bantuan_logistik.user_nik = users.nik`
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});


router.post('/admin-upload-bantuan-logistik', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'surat_permohonan_bantuan_logistik' },
    { name: 'dokumentasi_bencana' }
]), async (req, res) => {
    const { jml_tedampak, NIK } = req.body;

    try {
        const user_nik = NIK;

        // Mengecek apakah semua file diunggah
        const requiredFields = ['ktp', 'surat_permohonan_bantuan_logistik', 'dokumentasi_bencana'];
        for (const field of requiredFields) {
            if (!req.files[field]) {
                return res.status(400).json({ message: `${field} diperlukan` });
            }
        }

        // Pastikan `jml_tedampak` ada dan tidak undefined
        if (!jml_tedampak) {
            return res.status(400).json({ message: 'Jumlah terdampak diperlukan' });
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_bantuan_logistik WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `BTL${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_bantuan_logistik WHERE no_lay = ?',
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
            'INSERT INTO lay_bantuan_logistik (no_lay, user_nik, ktp, surat_permohonan_bantuan_logistik, dokumentasi_bencana, jml_tedampak, submit_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.surat_permohonan_bantuan_logistik),
                JSON.stringify(filePaths.dokumentasi_bencana),
                jml_tedampak
            ]
        );
                
        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});

module.exports = router;

// rute API untuk mendapatkan detail bantuan logistik dan data user terkait



// router.put('/update-admin-bantuan-logistik/:no_lay', upload.fields([
//     { name: 'ktp', maxCount: 1 },
//     { name: 'surat_permohonan_bantuan_logistik', maxCount: 1 },
//     { name: 'dokumentasi_bencana', maxCount: 1 },
//     { name: 'product', maxCount: 1 } // Tambahkan product
// ]), async (req, res) => {
//     const { no_lay } = req.params;
//     const { jml_tedampak, valid_at, reject_at, accept_at, reason, product } = req.body;

//     try {
//         const [rows] = await db.execute(
//             'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ?',
//             [no_lay]
//         );
        
//         if (rows.length === 0) {
//             return res.status(404).json({ message: 'Data not found' });
//         }
        
//         const updateFields = {};
//         if (req.files.ktp) updateFields.ktp = JSON.stringify([req.files.ktp[0].path]);
//         if (req.files.surat_permohonan_bantuan_logistik) updateFields.surat_permohonan_bantuan_logistik = JSON.stringify([req.files.surat_permohonan_bantuan_logistik[0].path]);
//         if (req.files.dokumentasi_bencana) updateFields.dokumentasi_bencana = JSON.stringify([req.files.dokumentasi_bencana[0].path]);
//         if (jml_tedampak) updateFields.jml_tedampak = jml_tedampak;
//         if (valid_at) updateFields.valid_at = valid_at;
//         if (reject_at) updateFields.reject_at = reject_at;
//         if (accept_at) updateFields.accept_at = accept_at;
//         if (reason) updateFields.reason = reason;
//         if (product) updateFields.product = product;
        
//         const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
//         const queryValues = Object.values(updateFields);
        
//         await db.execute(
//             `UPDATE lay_bantuan_logistik SET ${queryFields} WHERE no_lay = ?`,
//             [...queryValues, no_lay]
//         );
//         // const [rows] = await db.execute(
//         //     'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ?',
//         //     [no_lay]
//         // );

//         // if (rows.length === 0) {
//         //     return res.status(404).json({ message: 'Data not found' });
//         //     }
            
//         // const uploadDir = path.join(__dirname, 'uploads');
//         // const updateFields = {};
//         // if (req.files && req.files.ktp) updateFields.ktp = JSON.stringify([path.join('uploads', path.relative(uploadDir, req.files.ktp[0].path)).replace(/\\/g, '/')]);
//         // if (req.files && req.files.surat_permohonan_bantuan_logistik) updateFields.surat_permohonan_bantuan_logistik = JSON.stringify([path.join('uploads', path.relative(uploadDir, req.files.surat_permohonan_bantuan_logistik[0].path)).replace(/\\/g, '/')]);
//         // if (req.files && req.files.dokumentasi_bencana) updateFields.dokumentasi_bencana = JSON.stringify([path.join('uploads', path.relative(uploadDir, req.files.dokumentasi_bencana[0].path)).replace(/\\/g, '/')]);
//         // if (req.files && req.files.product) updateFields.product = JSON.stringify([path.join('uploads', path.relative(uploadDir, req.files.product[0].path)).replace(/\\/g, '/')]);
//         // if (jml_tedampak) updateFields.jml_tedampak = jml_tedampak;
//         // if (valid_at) updateFields.valid_at = valid_at;
//         // if (reject_at) updateFields.reject_at = reject_at;
//         // if (accept_at) updateFields.accept_at = accept_at;
//         // if (reason) updateFields.reason = reason;
//         // if (product) updateFields.product = product;

//         // Periksa jika ada field yang perlu diupdate
//         if (Object.keys(updateFields).length > 0) {
//             const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
//             const queryValues = Object.values(updateFields);

//             await db.execute(
//                 `UPDATE lay_bantuan_logistik SET ${queryFields} WHERE no_lay = ?`,
//                 [...queryValues, no_lay]
//             );

//             res.status(200).json({ message: 'Data updated successfully', ...updateFields });
//         } else {
//             res.status(400).json({ message: 'No fields to update' });
//         }
//     } catch (error) {
//         console.error('Database error:', error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });







// // Multer storage configuration for admin
// const adminStorage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         // const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'bantuan-logistik');
//         const uploadPath = path.join('bantuan-logistik');

//         // Cek jika direktori ada, jika tidak, buat direktori
//         fs.mkdir(uploadPath, { recursive: true }, (err) => {
//             if (err) {
//                 console.error('Failed to create directory', err);
//                 return cb(err);
//             }
//             cb(null, uploadPath);
//         });
//     },
//     filename: function (req, file, cb) {
//         const originalName = file.originalname.replace(/\s+/g, '_'); // Ganti spasi dengan garis bawah
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//         const shortUniqueSuffix = String(uniqueSuffix).slice(-10);
//         const finalFileName = shortUniqueSuffix + '-' + originalName;
//         cb(null, finalFileName);
//     }
// });



// const uploadAdmin = multer({ storage: adminStorage });
// Trus kalau saya tekan tombol "data valid" maka kolom valid_at diisi tanggal ketika saya tekan tombol "data valid", trus ketika saya tekan tombol itu field alsan juga hrus kosong. Selanjutnya ketika saya tekan tombol "tidak valid" maka field alasan hrus keisi, dan jika sudah keisi data dri field alasan ini dimasukkan ke kolom reason, dan kolom reject_at diisi tanggal ketika saya tekan tombol tsb.






// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');
// const db = require('../config/db');
// const authenticateUser = require('../middleware/authenticateUser'); // Pastikan jalur ini benar

// const router = express.Router();

// // Konfigurasi penyimpanan untuk multer
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         const userId = req.user.id;
//         const uploadPath = path.join('uploads/bantuan-logistik', userId.toString());

//         // Periksa apakah direktori ada, jika tidak buat direktori tersebut
//         fs.mkdir(uploadPath, { recursive: true }, (err) => {
//             if (err) {
//                 console.error('Gagal membuat direktori', err);
//                 return cb(err);
//             }
//             cb(null, uploadPath);
//         });
//     },
//     filename: function (req, file, cb) {
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//         const originalName = file.originalname.replace(/\s+/g, '_'); // Ganti spasi dengan underscores
//         cb(null, uniqueSuffix + '-' + originalName);
//     }
// });

// const upload = multer({ storage: storage });

// router.post('/upload-Bantuan-Logistik', authenticateUser, upload.fields([
//     { name: 'ktp', maxCount: 1 },
//     { name: 'surat_permohonan_bantuan_logistik', maxCount: 1 },
//     { name: 'dokumentasi_bencana', maxCount: 1 }
// ]), async (req, res) => {
//     const { jml_tedampak } = req.body;
//     const user_nik = req.user.id;

//     if (!req.files || !req.files.ktp || !req.files.surat_permohonan_bantuan_logistik || !req.files.dokumentasi_bencana) {
//         return res.status(400).json({ message: 'Semua file diperlukan' });
//     }

//     const date = new Date();
//     const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD

//     try {
//         // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
//         const [countResult] = await db.execute(
//             'SELECT COUNT(*) as count FROM lay_bantuan_logistik WHERE DATE(submit_at) = ?',
//             [formattedDate]
//         );

//         let count = countResult[0].count + 1; // Increment count for the current submission
//         let no_lay;
//         let isUnique = false;

//         // Loop to ensure no_lay is unique
//         while (!isUnique) {
//             no_lay = `BLG${formattedDate}${count.toString().padStart(3, '0')}`;

//             const [existingNoLay] = await db.execute(
//                 'SELECT COUNT(*) as count FROM lay_bantuan_logistik WHERE no_lay = ?',
//                 [no_lay]
//             );

//             if (existingNoLay[0].count === 0) {
//                 isUnique = true; // no_lay is unique
//             } else {
//                 count++; // increment count and try again
//             }
//         }

//         const [result] = await db.execute(
//             'INSERT INTO lay_bantuan_logistik (no_lay, user_nik, ktp, surat_permohonan_bantuan_logistik, dokumentasi_bencana, jml_tedampak, submit_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//             [
//                 no_lay,
//                 user_nik,
//                 req.files.ktp[0].path,
//                 req.files.surat_permohonan_bantuan_logistik[0].path,
//                 req.files.dokumentasi_bencana[0].path,
//                 jml_tedampak
//             ]
//         );

//         res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Kesalahan database', error });
//     }
// });


// // router.get('/lay-bantuan-logistik', async (req, res) => {
// //     const { user_nik } = req.query;

// //     try {
// //         const [rows] = await db.execute(
// //             'SELECT id, no_lay, user_nik, ktp, surat_permohonan_bantuan_logistik, dokumentasi_bencana, jml_tedampak, submit_at FROM lay_bantuan_logistik WHERE user_nik = ?',
// //             [user_nik]
// //         );

// //         res.status(200).json(rows);
// //     } catch (error) {
// //         console.error(error);
// //         res.status(500).json({ message: 'Database error', error });
// //     }
// // });

// router.get('/lay-bantuan-logistik', async (req, res) => {
//     const { user_nik } = req.query;

//     try {
//         const [rows] = await db.execute(
//             'SELECT id, no_lay, user_nik, ktp, surat_permohonan_bantuan_logistik, dokumentasi_bencana, jml_tedampak, submit_at, valid_at, reject_at, accept_at FROM lay_bantuan_logistik WHERE user_nik = ?',
//             [user_nik]
//         );

//         res.status(200).json(rows);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });

// // Rute untuk mengambil data berdasarkan nomor pelayanan (nopel)
// router.get('/lay-bantuan-logistik/:nopel', authenticateUser, async (req, res) => {
//     const { nopel } = req.params;
//     const user_nik = req.user.id;

//     try {
//         const [row] = await db.execute(
//             'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ? AND user_nik = ?',
//             [nopel, user_nik]
//         );

//         if (row.length === 0) {
//             return res.status(404).json({ message: 'Data not found' });
//         }

//         res.status(200).json(row[0]);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });

// router.get('/download-file', (req, res) => {
//     const filePaths = req.query.paths; // Mengambil array jalur file dari query params

//     // Lakukan pemeriksaan apakah array jalur file valid
//     if (!filePaths || !Array.isArray(filePaths)) {
//         return res.status(400).json({ error: 'Invalid file paths' });
//     }

//     // Mengatur header response untuk menentukan jenis konten
//     res.setHeader('Content-Type', 'application/zip');
//     res.setHeader('Content-Disposition', 'attachment; filename=files.zip');

//     const zip = new AdmZip();

//     // Meloopi setiap jalur file, membaca file dan menambahkannya ke dalam zip
//     filePaths.forEach(filePath => {
//         if (fs.existsSync(filePath)) {
//             const fileData = fs.readFileSync(filePath);
//             zip.addFile(path.basename(filePath), fileData);
//         }
//     });

//     // Mengirimkan zip sebagai respons
//     const zipBuffer = zip.toBuffer();
//     res.send(zipBuffer);
// });



// router.delete('/delete-bantuan-logistik/:no_lay', authenticateUser, async (req, res) => {
//     const { no_lay } = req.params;
//     const user_nik = req.user.id;

//     try {
//         // Dapatkan data yang akan dihapus
//         const [rows] = await db.execute(
//             'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ? AND user_nik = ?',
//             [no_lay, user_nik]
//         );

//         if (rows.length === 0) {
//             return res.status(404).json({ message: 'Data not found' });
//         }

//         const data = rows[0];

//         // Hapus file terkait jika ada
//         if (data.ktp && fs.existsSync(data.ktp)) {
//             fs.unlinkSync(data.ktp);
//         }
//         if (data.surat_permohonan_bantuan_logistik && fs.existsSync(data.surat_permohonan_bantuan_logistik)) {
//             fs.unlinkSync(data.surat_permohonan_bantuan_logistik);
//         }
//         if (data.dokumentasi_bencana && fs.existsSync(data.dokumentasi_bencana)) {
//             fs.unlinkSync(data.dokumentasi_bencana);
//         }

//         // Hapus entri dari database
//         await db.execute(
//             'DELETE FROM lay_bantuan_logistik WHERE no_lay = ? AND user_nik = ?',
//             [no_lay, user_nik]
//         );

//         res.status(200).json({ message: 'Data deleted successfully' });
//     } catch (error) {
//         console.error('Database error:', error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });




// module.exports = router;










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
//             `SELECT ${type} FROM lay_bantuan_logistik WHERE id = ?`,
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

    // router.put('/update-bantuan-logistik/:no_lay', authenticateUser, upload.fields([
    //     { name: 'ktp' },
    //     { name: 'surat_permohonan_bantuan_logistik' },
    //     { name: 'dokumentasi_bencana' }
    // ]), async (req, res) => {
    //     const no_lay = req.params.no_lay;
    //     const user_nik = req.user.id;
    
    //     try {
    //         const existingData = await db.execute(
    //             'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ? AND user_nik = ?',
    //             [no_lay, user_nik]
    //         );
    
    //         if (existingData[0].length === 0) {
    //             return res.status(404).json({ message: 'Data tidak ditemukan' });
    //         }
    
    //         // Membuat objek untuk menyimpan jalur file yang diperbarui
    //         const updatedFilePaths = {};
    //         for (const field in req.files) {
    //             updatedFilePaths[field] = req.files[field].map(file => file.path);
    //         }
    
    //         const fieldsToUpdate = {};
    //         const columns = ['ktp', 'surat_permohonan_bantuan_logistik', 'dokumentasi_bencana'];
    //         columns.forEach(column => {
    //             if (updatedFilePaths[column]) {
    //                 fieldsToUpdate[column] = JSON.stringify(updatedFilePaths[column]);
    //             } else {
    //                 fieldsToUpdate[column] = existingData[0][0][column];
    //             }
    //         });
    
    //         // Adding the jml_tedampak to the fieldsToUpdate
    //         fieldsToUpdate.jml_tedampak = req.body.jml_tedampak || existingData[0][0].jml_tedampak;
    
    //         await db.execute(
    //             `UPDATE lay_bantuan_logistik SET ktp = ?, surat_permohonan_bantuan_logistik = ?, dokumentasi_bencana = ?, jml_tedampak = ? WHERE no_lay = ?`,
    //             [
    //                 fieldsToUpdate.ktp,
    //                 fieldsToUpdate.surat_permohonan_bantuan_logistik,
    //                 fieldsToUpdate.dokumentasi_bencana,
    //                 fieldsToUpdate.jml_tedampak,
    //                 no_lay
    //             ]
    //         );
    
    //         res.status(200).json({ message: 'Data berhasil diperbarui' });
    //     } catch (error) {
    //         console.error(error);
    //         res.status(500).json({ message: 'Kesalahan database', error });
    //     }
    // });
    



// router.put('/update-Skt/:no_lay', authenticateUser, upload.fields([
//     { name: 'ktp', maxCount: 1 },
//     { name: 'surat_permohonan_bantuan_logistik', maxCount: 1 },
//     { name: 'dokumentasi_bencana', maxCount: 1 },
//     { name: 'jml_tedampak', maxCount: 1 },
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
//             'SELECT * FROM lay_bantuan_logistik WHERE no_lay = ? AND user_nik = ?',
//             [no_lay, user_nik]
//         );

//         if (rows.length === 0) {
//             return res.status(404).json({ message: 'Data not found' });
//         }

//         const updateFields = {};
//         if (req.files.ktp) updateFields.ktp = req.files.ktp[0].path;
//         if (req.files.surat_permohonan_bantuan_logistik) updateFields.surat_permohonan_bantuan_logistik = req.files.surat_permohonan_bantuan_logistik[0].path;
//         if (req.files.dokumentasi_bencana) updateFields.dokumentasi_bencana = req.files.dokumentasi_bencana[0].path;
//         if (req.files.jml_tedampak) updateFields.jml_tedampak = req.files.jml_tedampak[0].path;
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
//             `UPDATE lay_bantuan_logistik SET ${queryFields} WHERE no_lay = ? AND user_nik = ?`,
//             [...queryValues, no_lay, user_nik]
//         );

//         res.status(200).json({ message: 'Data updated successfully', ...updateFields });
//     } catch (error) {
//         console.error('Database error:', error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });