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
        const uploadPath = path.join('uploads/pengaduan');

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

// POST
router.post('/upload-Pengaduan', authenticateUser, upload.fields([{ name: 'foto' }]), async (req, res) => {
    const { masalah, harapan, user_nik } = req.body;

    const requiredFields = ['foto'];
    for (const field of requiredFields) {
        if (!req.files[field]) {
            return res.status(400).json({ message: `${field} diperlukan` });
        }
    }

    const date = new Date();
    const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, '');

    try {
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM pengaduan WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1;
        let no_adu;
        let isUnique = false;

        // Loop to ensure no_adu is unique
        while (!isUnique) {
            no_adu = `ADU${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM pengaduan WHERE no_adu = ?',
                [no_adu]
            );

            if (existingNoLay[0].count === 0) {
                isUnique = true;
            } else {
                count++;
            }
        }

        // Membuat objek untuk menyimpan jalur file jika ada
        const filePaths = {};
        for (const field of requiredFields) {
            filePaths[field] = req.files[field].map(file => file.path);
        }

        const [result] = await db.execute(
            'INSERT INTO pengaduan (no_adu, user_nik, masalah, harapan, foto, submit_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [
                no_adu,
                user_nik,
                masalah,
                harapan,
                JSON.stringify(filePaths.foto)
            ]
        );

        console.log('Data berhasil disimpan:', result);
        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_adu });
    } catch (error) {
        console.error('Kesalahan database:', error); // Log untuk debug
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});








// GET ALL BERDASARKAN ID YANG LOGIN
router.get('/lay-pengaduan', async (req, res) => {
    const { user_nik } = req.query;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM pengaduan WHERE user_nik = ?',
            [user_nik]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// GET BERDASATKAN NOPEL
router.get('/lay-pengaduan/:no_adu', authenticateUser, async (req, res) => {
    const { no_adu } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM pengaduan WHERE no_adu = ?',
            [no_adu]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const pengaduan = rows[0];
        const userId = pengaduan.user_nik;

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
            ...pengaduan,
            user: user
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// UPDATE
router.put('/update-pengaduan/:no_adu', authenticateUser, upload.fields([
    { name: 'foto' },
]), async (req, res) => {
    const { no_adu } = req.params;
    const { masalah, harapan, jawaban } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM pengaduan WHERE no_adu = ?',
            [no_adu]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const updateFields = {};
        if (req.files && req.files.foto) updateFields.foto = JSON.stringify([req.files.foto[0].path]);
        if (masalah) updateFields.masalah = masalah;
        if (harapan) updateFields.harapan = harapan;
        if (jawaban) updateFields.jawaban = jawaban;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE pengaduan SET ${queryFields} WHERE no_adu = ?`,
            [...queryValues, no_adu]
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


// DELETE
router.delete('/delete-pengaduan/:no_adu', authenticateUser, async (req, res) => {
    const { no_adu } = req.params;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM pengaduan WHERE no_adu = ?',
            [no_adu]
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
        deleteFiles(data.foto);

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM pengaduan WHERE no_adu = ?',
            [no_adu]
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


// Endpoint to get all data from pengaduan and corresponding user data
router.get('/all-lay-pengaduan-DSPM', authenticateUser, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT pengaduan.*, users.nik, users.full_name AS nama 
            FROM pengaduan 
            JOIN users ON pengaduan.user_nik = users.nik`
        );

        if (rows.length === 0) {
            console.log("No data found in the database");
        } else {
            console.log("Data retrieved from the database:", rows);
        }

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});


router.post('/admin-upload-pengaduan', authenticateUser, upload.fields([
    { name: 'foto' },
]), async (req, res) => {
    const { masalah, harapan, NIK } = req.body;

    try {
        const user_nik = NIK;

        const requiredFields = ['foto'];
        for (const field of requiredFields) {
            if (!req.files[field]) {
                return res.status(400).json({ message: `${field} diperlukan` });
            }
        }

        // Pastikan `masalah` dan `harapan` ada dan tidak undefined
        if (!masalah || !harapan) {
            return res.status(400).json({ message: 'Field masalah dan harapan diperlukan' });
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM pengaduan WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_adu;
        let isUnique = false;

        // Loop to ensure no_adu is unique
        while (!isUnique) {
            no_adu = `ADU${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM pengaduan WHERE no_adu = ?',
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
        for (const field of requiredFields) {
            filePaths[field] = req.files[field].map(file => file.path);
        }

        const [result] = await db.execute(
            'INSERT INTO pengaduan (no_adu, user_nik, foto, masalah, harapan, submit_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [
                no_adu,
                user_nik,
                JSON.stringify(filePaths.foto),
                masalah,
                harapan
            ]
        );
        
        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_adu });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});


module.exports = router;