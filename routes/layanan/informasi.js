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
        const uploadPath = path.join('uploads/informasi');

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
router.post('/upload-informasi', authenticateUser, upload.fields([
    { name: 'foto' },
]), async (req, res) => {
    const { judul, isi } = req.body;

    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    if (!judul || !isi) {
        console.log('Field Diperlukan'); // Log untuk debug
        return res.status(400).json({ message: 'Field Diperlukan' });
    }

    try {
        // Membuat objek untuk menyimpan jalur file jika ada
        let fotoPaths = [];
        if (req.files['foto']) {
            fotoPaths = req.files['foto'].map(file => file.path);
        }

        console.log('Inserting into database...');
        const [result] = await db.execute(
            'INSERT INTO informasi (judul, isi, foto, submit_at) VALUES (?, ?, ?, NOW())',
            [
                judul,
                isi,
                JSON.stringify(fotoPaths),
            ]
        );

        console.log('Data berhasil disimpan:', result);
        res.status(201).json({ message: 'Data telah disimpan'});
    } catch (error) {
        console.error('Kesalahan database:', error); // Log untuk debug
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});

router.get('/all-informasi', authenticateUser, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT * FROM informasi`
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.get('/informasi/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM informasi WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const informasi = rows[0];

        // Gabungkan data bantuan logistik dan data user
        const responseData = {
            ...informasi,
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.put('/update-informasi/:id', authenticateUser, upload.fields([
    { name: 'foto' },
]), async (req, res) => {
    const { id } = req.params;
    const { judul, isi } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM informasi WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const updateFields = {};
        if (req.files && req.files.foto) updateFields.foto = JSON.stringify([req.files.foto[0].path]);
        if (judul) updateFields.judul = judul;
        if (isi) updateFields.isi = isi;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE informasi SET ${queryFields} WHERE id = ?`,
            [...queryValues, id]
        );

        if (Object.keys(updateFields).length > 0) {
            res.status(200).json({ message: 'Data updated successfully', ...updateFields });
        } else {
            res.status(400).json({ message: 'No fields to update' });
        }

    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});


router.delete('/delete-informasi/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM informasi WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const data = rows[0];

        // Hapus file terkait jika ada
        if (data.foto && fs.existsSync(data.foto)) {
            fs.unlinkSync(data.foto);
        }
        if (data.judul && fs.existsSync(data.judul)) {
            fs.unlinkSync(data.judul);
        }
        if (data.isi && fs.existsSync(data.isi)) {
            fs.unlinkSync(data.isi);
        }

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM informasi WHERE id = ?',
            [id]
        );

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});








// // GET ALL BERDASARKAN ID YANG LOGIN
// router.get('/lay-pengaduan', async (req, res) => {
//     const { user_id } = req.query;

//     try {
//         const [rows] = await db.execute(
//             'SELECT * FROM pengaduan WHERE user_id = ?',
//             [user_id]
//         );

//         res.status(200).json(rows);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });

// // GET BERDASATKAN NOPEL


// // UPDATE
// router.put('/update-pengaduan/:id', authenticateUser, upload.fields([
//     { name: 'foto' },
// ]), async (req, res) => {
//     const { id } = req.params;
//     const { judul, isi } = req.body;

//     try {
//         const [rows] = await db.execute(
//             'SELECT * FROM pengaduan WHERE id = ?',
//             [id]
//         );

//         if (rows.length === 0) {
//             return res.status(404).json({ message: 'Data not found' });
//         }

//         const updateFields = {};
//         if (req.files && req.files.foto) updateFields.foto = JSON.stringify([req.files.foto[0].path]);
//         if (judul) updateFields.judul = judul;
//         if (isi) updateFields.isi = isi;
//         if (jawaban) updateFields.jawaban = jawaban;

//         const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
//         const queryValues = Object.values(updateFields);

//         await db.execute(
//             `UPDATE pengaduan SET ${queryFields} WHERE id = ?`,
//             [...queryValues, id]
//         );

//         if (Object.keys(updateFields).length > 0) {
//             res.status(200).json({ message: 'Data updated successfully', ...updateFields });
//         } else {
//             res.status(400).json({ message: 'No fields to update' });
//         }

//     } catch (error) {
//         console.error('Database error:', error);
//         res.status(500).json({ message: 'Database error', error });
//     }
// });


// DELETE


// FOR ADMIN
// FOR ADMIN
// FOR ADMIN


// Endpoint to get all data from pengaduan and corresponding user data



router.post('/admin-upload-informasi', authenticateUser, upload.fields([
    { name: 'foto', maxCount: 1 },
]), async (req, res) => {
    const { judul, isi, NIK } = req.body;

    try {
        // Mengambil user_id berdasarkan NIK
        const [user] = await db.execute('SELECT id FROM users WHERE nik = ?', [NIK]);
        if (user.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user_id = user[0].id;

        // Pastikan `judul` dan `isi` ada dan tidak undefined
        if (!judul || !isi) {
            return res.status(400).json({ message: 'Field judul dan isi diperlukan' });
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM informasi WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_adu;
        let isUnique = false;

        // Loop to ensure no_adu is unique
        while (!isUnique) {
            no_adu = `ADU${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM informasi WHERE no_adu = ?',
                [no_adu]
            );

            if (existingNoLay[0].count === 0) {
                isUnique = true; // no_adu is unique
            } else {
                count++; // increment count and try again
            }
        }

        // Membuat objek untuk menyimpan jalur file relatif dari 'uploads'
        const filePaths = {};
        if (req.files && req.files.foto) {
            filePaths.foto = req.files.foto.map(file => file.path);
        }

        const [result] = await db.execute(
            'INSERT INTO informasi (no_adu, user_id, foto, judul, isi, submit_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [
                no_adu,
                user_id,
                req.files && req.files.foto ? JSON.stringify(filePaths.foto) : null,
                judul,
                isi
            ]
        );
        
        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_adu });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});


module.exports = router;