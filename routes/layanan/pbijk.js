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
        const userId = req.user.id;
        const uploadPath = path.join('uploads/pbijk', userId.toString());

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

router.post('/upload-Pbijk', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'suket_rawat_inap'},
]), async (req, res) => {
    const { user_nik } = req.body;

    // Mengecek apakah semua file diunggah
    const requiredFields = ['ktp', 'suket_rawat_inap'];
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
            'SELECT COUNT(*) as count FROM lay_pbijk WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `PBI${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_pbijk WHERE no_lay = ?',
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
            'INSERT INTO lay_pbijk (no_lay, user_nik, ktp, suket_rawat_inap, submit_at) VALUES (?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.suket_rawat_inap)
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});


router.get('/lay-PBI-JK', async (req, res) => {
    const { user_nik } = req.query;

    try {
        const [rows] = await db.execute(
            'SELECT id, no_lay, user_nik, ktp, suket_rawat_inap, submit_at, valid_at, reject_at, accept_at FROM lay_pbijk WHERE user_nik = ?',
            [user_nik]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// Rute untuk mengambil data berdasarkan nomor pelayanan (nopel)
router.get('/lay-PBI-JK/:nopel', authenticateUser, async (req, res) => {
    const { nopel } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_pbijk WHERE no_lay = ?',
            [nopel]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const pbijk = rows[0];
        const userId = pbijk.user_nik;

        const [userRows] = await db.execute(
            'SELECT * FROM users WHERE nik = ?',
            [userId]
        );

        const user = userRows[0];

        // Gabungkan data bantuan logistik dan data user
        const responseData = {
            ...pbijk,
            user: user
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.put('/update-PBI-JK/:no_lay', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'suket_rawat_inap' },
    { name: 'product' }
]), async (req, res) => {
    const { no_lay } = req.params;
    const { valid_at, reject_at, accept_at, reason } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_pbijk WHERE no_lay = ?',
            [no_lay]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const updateFields = {};
        if (req.files && req.files.ktp) updateFields.ktp = JSON.stringify([req.files.ktp[0].path]);
        if (req.files && req.files.suket_rawat_inap) updateFields.suket_rawat_inap = JSON.stringify([req.files.suket_rawat_inap[0].path]);
        if (req.files && req.files.product) updateFields.product = JSON.stringify([req.files.product[0].path]);
        if (valid_at) updateFields.valid_at = valid_at;
        if (reject_at) updateFields.reject_at = reject_at;
        if (accept_at) updateFields.accept_at = accept_at;
        if (reason) updateFields.reason = reason;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE lay_pbijk SET ${queryFields} WHERE no_lay = ?`,
            [...queryValues, no_lay]
        );

        if (Object.keys(updateFields).length > 0) {
            const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
            const queryValues = Object.values(updateFields);

            await db.execute(
                `UPDATE lay_pbijk SET ${queryFields} WHERE no_lay = ?`,
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

router.delete('/delete-PBI-JK/:no_lay', authenticateUser, async (req, res) => {
    const { no_lay } = req.params;
    const user_nik = req.user.id;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM lay_pbijk WHERE no_lay = ? AND user_nik = ?',
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
        if (data.suket_rawat_inap && fs.existsSync(data.suket_rawat_inap)) {
            fs.unlinkSync(data.suket_rawat_inap);
        }

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM lay_pbijk WHERE no_lay = ? AND user_nik = ?',
            [no_lay, user_nik]
        );

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});



// ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN

router.get('/all-lay-PBI-JK', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT lay_pbijk.*, users.nik, users.full_name AS nama 
            FROM lay_pbijk 
            JOIN users ON lay_pbijk.user_nik = users.nik`
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.post('/admin-upload-PBI-JK', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'suket_rawat_inap' },
]), async (req, res) => {
    const { NIK } = req.body;

    try {
        const user_nik = NIK;

        // Mengecek apakah semua file diunggah
        const requiredFields = ['ktp', 'suket_rawat_inap'];
        for (const field of requiredFields) {
            if (!req.files[field]) {
                return res.status(400).json({ message: `${field} diperlukan` });
            }
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_pbijk WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `PBI${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_pbijk WHERE no_lay = ?',
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
            'INSERT INTO lay_pbijk (no_lay, user_nik, ktp, suket_rawat_inap, submit_at) VALUES (?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.suket_rawat_inap),
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});




module.exports = router;

