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
        const uploadPath = path.join('uploads/pengangkatan-anak');

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

router.post('/upload-Pengangkatan-Anak', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'suket_fisik_jiwa' },
    { name: 'suket_narkoba' },
    { name: 'skck' },
    { name: 'suket_penghasilan' },
    { name: 'izin_tertulis' },
    { name: 'kk' },
    { name: 'akta_kelahiran' },
    { name: 'akta_nikah' },
    { name: 'foto' },
    { name: 'form_pernyataan' },
]), async (req, res) => {
    const { user_nik } = req.body;

    // Mengecek apakah semua file diunggah
    const requiredFields = ['ktp', 'suket_fisik_jiwa', 'suket_narkoba', 'skck', 'suket_penghasilan', 'izin_tertulis', 'kk', 'akta_kelahiran', 'akta_nikah', 'foto', 'form_pernyataan'];
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
            'SELECT COUNT(*) as count FROM lay_angkat_anak WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `CPA${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_angkat_anak WHERE no_lay = ?',
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
            'INSERT INTO lay_angkat_anak (no_lay, user_nik, ktp, suket_fisik_jiwa, suket_narkoba, skck, suket_penghasilan, izin_tertulis, kk, akta_kelahiran, akta_nikah, foto, form_pernyataan, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.suket_fisik_jiwa),
                JSON.stringify(filePaths.suket_narkoba),
                JSON.stringify(filePaths.skck),
                JSON.stringify(filePaths.suket_penghasilan),
                JSON.stringify(filePaths.izin_tertulis),
                JSON.stringify(filePaths.kk),
                JSON.stringify(filePaths.akta_kelahiran),
                JSON.stringify(filePaths.akta_nikah),
                JSON.stringify(filePaths.foto),
                JSON.stringify(filePaths.form_pernyataan)
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});


router.get('/lay-pengangkatan-anak', async (req, res) => {
    const { user_nik } = req.query;

    try {
        const [rows] = await db.execute(
            'SELECT id, no_lay, user_nik, ktp, suket_fisik_jiwa, suket_narkoba, skck, suket_penghasilan, izin_tertulis, kk, akta_kelahiran, akta_nikah, foto, form_pernyataan, submit_at, valid_at, reject_at, accept_at FROM lay_angkat_anak WHERE user_nik = ?',
            [user_nik]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// Rute untuk mengambil data berdasarkan nomor pelayanan (nopel)
router.get('/lay-pengangkatan-anak/:nopel', authenticateUser, async (req, res) => {
    const { nopel } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_angkat_anak WHERE no_lay = ?',
            [nopel]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const angkatAnak = rows[0];
        const userId = angkatAnak.user_nik;

        const [userRows] = await db.execute(
            'SELECT * FROM users WHERE nik = ?',
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = userRows[0];

        const responseData = {
            ...angkatAnak,
            user: user
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});



router.put('/update-pengangkatan-anak/:no_lay', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'suket_fisik_jiwa' },
    { name: 'suket_narkoba' },
    { name: 'skck' },
    { name: 'suket_penghasilan' },
    { name: 'izin_tertulis' },
    { name: 'kk' },
    { name: 'akta_kelahiran' },
    { name: 'akta_nikah' },
    { name: 'foto' },
    { name: 'form_pernyataan' },
    { name: 'product' },
]), async (req, res) => {
    const { no_lay } = req.params;
    const { valid_at, reject_at, accept_at, reason } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_angkat_anak WHERE no_lay = ?',
            [no_lay]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        // Membuat objek untuk menyimpan jalur file yang diperbarui
        const updateFields = {};
        if (req.files && req.files.ktp) updateFields.ktp = JSON.stringify([req.files.ktp[0].path]);
        if (req.files && req.files.suket_fisik_jiwa) updateFields.suket_fisik_jiwa = JSON.stringify([req.files.suket_fisik_jiwa[0].path]);
        if (req.files && req.files.suket_narkoba) updateFields.suket_narkoba = JSON.stringify([req.files.suket_narkoba[0].path]);
        if (req.files && req.files.skck) updateFields.skck = JSON.stringify([req.files.skck[0].path]);
        if (req.files && req.files.suket_penghasilan) updateFields.suket_penghasilan = JSON.stringify([req.files.suket_penghasilan[0].path]);
        if (req.files && req.files.izin_tertulis) updateFields.izin_tertulis = JSON.stringify([req.files.izin_tertulis[0].path]);
        if (req.files && req.files.kk) updateFields.kk = JSON.stringify([req.files.kk[0].path]);
        if (req.files && req.files.akta_kelahiran) updateFields.akta_kelahiran = JSON.stringify([req.files.akta_kelahiran[0].path]);
        if (req.files && req.files.akta_nikah) updateFields.akta_nikah = JSON.stringify([req.files.akta_nikah[0].path]);
        if (req.files && req.files.foto) updateFields.foto = JSON.stringify([req.files.foto[0].path]);
        if (req.files && req.files.form_pernyataan) updateFields.form_pernyataan = JSON.stringify([req.files.form_pernyataan[0].path]);
        if (req.files && req.files.product) updateFields.product = JSON.stringify([req.files.product[0].path]);
        if (valid_at) updateFields.valid_at = valid_at;
        if (reject_at) updateFields.reject_at = reject_at;
        if (accept_at) updateFields.accept_at = accept_at;
        if (reason) updateFields.reason = reason;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE lay_angkat_anak SET ${queryFields} WHERE no_lay = ?`,
            [...queryValues, no_lay]
        );

        if (Object.keys(updateFields).length > 0) {
            const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
            const queryValues = Object.values(updateFields);

            await db.execute(
                `UPDATE lay_angkat_anak SET ${queryFields} WHERE no_lay = ?`,
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




router.delete('/delete-pengangkatan-anak/:no_lay', authenticateUser, async (req, res) => {
    const { no_lay } = req.params;
    const user_nik = req.user.id;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM lay_angkat_anak WHERE no_lay = ? AND user_nik = ?',
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
        if (data.suket_fisik_jiwa && fs.existsSync(data.suket_fisik_jiwa)) {
            fs.unlinkSync(data.suket_fisik_jiwa);
        }
        if (data.suket_narkoba && fs.existsSync(data.suket_narkoba)) {
            fs.unlinkSync(data.suket_narkoba);
        }
        if (data.skck && fs.existsSync(data.skck)) {
            fs.unlinkSync(data.skck);
        }
        if (data.suket_penghasilan && fs.existsSync(data.suket_penghasilan)) {
            fs.unlinkSync(data.suket_penghasilan);
        }
        if (data.izin_tertulis && fs.existsSync(data.izin_tertulis)) {
            fs.unlinkSync(data.izin_tertulis);
        }
        if (data.kk && fs.existsSync(data.kk)) {
            fs.unlinkSync(data.kk);
        }
        if (data.akta_kelahiran && fs.existsSync(data.akta_kelahiran)) {
            fs.unlinkSync(data.akta_kelahiran);
        }
        if (data.akta_nikah && fs.existsSync(data.akta_nikah)) {
            fs.unlinkSync(data.akta_nikah);
        }
        if (data.foto && fs.existsSync(data.foto)) {
            fs.unlinkSync(data.foto);
        }
        if (data.form_pernyataan && fs.existsSync(data.form_pernyataan)) {
            fs.unlinkSync(data.form_pernyataan);
        }

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM lay_angkat_anak WHERE no_lay = ? AND user_nik = ?',
            [no_lay, user_nik]
        );

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});


// ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN

router.get('/all-lay-pengangkatan-anak', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT lay_angkat_anak.*, users.nik, users.full_name AS nama 
            FROM lay_angkat_anak 
            JOIN users ON lay_angkat_anak.user_nik = users.nik`
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.post('/admin-upload-pengangkatan-anak', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'suket_fisik_jiwa' },
    { name: 'suket_narkoba' },
    { name: 'skck' },
    { name: 'suket_penghasilan' },
    { name: 'izin_tertulis' },
    { name: 'kk' },
    { name: 'akta_kelahiran' },
    { name: 'akta_nikah' },
    { name: 'foto' },
    { name: 'form_pernyataan' },
]), async (req, res) => {
    const { NIK } = req.body;

    try {
        const user_nik = NIK;

        // Mengecek apakah semua file diunggah
        const requiredFields = ['ktp', 'suket_fisik_jiwa', 'suket_narkoba', 'skck', 'suket_penghasilan', 'izin_tertulis', 'kk', 'akta_kelahiran', 'akta_nikah', 'foto', 'form_pernyataan'];
        for (const field of requiredFields) {
            if (!req.files[field]) {
                return res.status(400).json({ message: `${field} diperlukan` });
            }
        }


        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_angkat_anak WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `CPA${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_angkat_anak WHERE no_lay = ?',
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
            'INSERT INTO lay_angkat_anak (no_lay, user_nik, ktp, suket_fisik_jiwa, suket_narkoba, skck, suket_penghasilan, izin_tertulis, kk, akta_kelahiran, akta_nikah, foto, form_pernyataan, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.suket_fisik_jiwa),
                JSON.stringify(filePaths.suket_narkoba),
                JSON.stringify(filePaths.skck),
                JSON.stringify(filePaths.suket_penghasilan),
                JSON.stringify(filePaths.izin_tertulis),
                JSON.stringify(filePaths.kk),
                JSON.stringify(filePaths.akta_kelahiran),
                JSON.stringify(filePaths.akta_nikah),
                JSON.stringify(filePaths.foto),
                JSON.stringify(filePaths.form_pernyataan),
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});




module.exports = router;

