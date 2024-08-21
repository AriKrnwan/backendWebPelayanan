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
        const uploadPath = path.join('uploads/penyandang-disabilitas');

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

router.post('/upload-Penyandang-Disabilitas', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'identitas_anak' },
    { name: 'kk' },
    { name: 'bpjs' },
]), async (req, res) => {
    const { jns_disabilitas, kebutuhan, user_nik } = req.body;

    // Mengecek apakah semua file diunggah
    const requiredFields = ['ktp', 'identitas_anak', 'kk', 'bpjs'];
    for (const field of requiredFields) {
        if (!req.files[field]) {
            return res.status(400).json({ message: `${field} diperlukan` });
        }
    }

    if (!kebutuhan || !jns_disabilitas) {
        return res.status(400).json({ message: 'Diperlukan' });
    }

    const date = new Date();
    const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD

    try {
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_penyandang_disabilitas WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `DPD${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_penyandang_disabilitas WHERE no_lay = ?',
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
            'INSERT INTO lay_penyandang_disabilitas (no_lay, user_nik, ktp, identitas_anak, kk, bpjs, jns_disabilitas, kebutuhan, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.identitas_anak),
                JSON.stringify(filePaths.kk),
                JSON.stringify(filePaths.bpjs),
                jns_disabilitas, 
                kebutuhan,
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});


router.get('/lay-penyandang-disabilitas', async (req, res) => {
    const { user_nik } = req.query;

    try {
        const [rows] = await db.execute(
            'SELECT id, no_lay, user_nik, ktp, identitas_anak, kk, bpjs, jns_disabilitas, kebutuhan, submit_at, valid_at, reject_at, accept_at FROM lay_penyandang_disabilitas WHERE user_nik = ?',
            [user_nik]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

// Rute untuk mengambil data berdasarkan nomor pelayanan (nopel)
router.get('/lay-penyandang-disabilitas/:nopel', authenticateUser, async (req, res) => {
    const { nopel } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_penyandang_disabilitas WHERE no_lay = ?',
            [nopel]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const penyandangDisabilitas = rows[0];
        const userId = penyandangDisabilitas.user_nik;

        const [userRows] = await db.execute(
            'SELECT * FROM users WHERE nik = ?',
            [userId]
        );

        const user = userRows[0];

        // Gabungkan data bantuan logistik dan data user
        const responseData = {
            ...penyandangDisabilitas,
            user: user
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.put('/update-penyandang-disabilitas/:no_lay', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'identitas_anak' },
    { name: 'kk' },
    { name: 'bpjs' },
    { name: 'product' }
]), async (req, res) => {
    const { no_lay } = req.params;
    const { jns_disabilitas, kebutuhan, valid_at, reject_at, accept_at, reason } = req.body;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM lay_penyandang_disabilitas WHERE no_lay = ?',
            [no_lay]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const updateFields = {};

        const collectFilePaths = (fieldName) => {
            return (req.files && req.files[fieldName]) ? JSON.stringify(req.files[fieldName].map(file => file.path)) : null;
        };

        if (req.files && req.files.ktp) updateFields.ktp = collectFilePaths('ktp');
        if (req.files && req.files.identitas_anak) updateFields.identitas_anak = collectFilePaths('identitas_anak');
        if (req.files && req.files.kk) updateFields.kk = collectFilePaths('kk');
        if (req.files && req.files.bpjs) updateFields.bpjs = collectFilePaths('bpjs');
        if (req.files && req.files.product) updateFields.product = collectFilePaths('product');

        if (jns_disabilitas) updateFields.jns_disabilitas = jns_disabilitas;
        if (kebutuhan) updateFields.kebutuhan = kebutuhan;
        if (valid_at) updateFields.valid_at = valid_at;
        if (reject_at) updateFields.reject_at = reject_at;
        if (accept_at) updateFields.accept_at = accept_at;
        if (reason) updateFields.reason = reason;

        const queryFields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const queryValues = Object.values(updateFields);

        await db.execute(
            `UPDATE lay_penyandang_disabilitas SET ${queryFields} WHERE no_lay = ?`,
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





router.delete('/delete-penyandang-disabilitas/:no_lay', authenticateUser, async (req, res) => {
    const { no_lay } = req.params;

    try {
        // Dapatkan data yang akan dihapus
        const [rows] = await db.execute(
            'SELECT * FROM lay_penyandang_disabilitas WHERE no_lay = ? AND user_nik = ?',
            [no_lay, user_nik]
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
        deleteFiles(data.identitas_anak);
        deleteFiles(data.kk);
        deleteFiles(data.bpjs);

        // Hapus entri dari database
        await db.execute(
            'DELETE FROM lay_penyandang_disabilitas WHERE no_lay = ?',
            [no_lay]
        );

        res.status(200).json({ message: 'Data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ message: 'Database error', error });
    }
});


// ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN ADMIN

router.get('/all-lay-penyandang-disabilitas', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT lay_penyandang_disabilitas.id AS lay_id, lay_penyandang_disabilitas.*, users.*
            FROM lay_penyandang_disabilitas 
            JOIN users ON lay_penyandang_disabilitas.user_nik = users.nik`
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.post('/admin-upload-penyandang-disabilitas', authenticateUser, upload.fields([
    { name: 'ktp' },
    { name: 'identitas_anak' },
    { name: 'kk' },
    { name: 'bpjs' },
]), async (req, res) => {
    const { jns_disabilitas, kebutuhan, NIK } = req.body;

    try {
        const user_nik = NIK;

        // Mengecek apakah semua file diunggah
        const requiredFields = ['ktp', 'identitas_anak', 'kk', 'bpjs'];
        for (const field of requiredFields) {
            if (!req.files[field]) {
                return res.status(400).json({ message: `${field} diperlukan` });
            }
        }

        if (!kebutuhan || !jns_disabilitas) {
            return res.status(400).json({ message: 'Jumlah terdampak diperlukan' });
        }

        const date = new Date();
        const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format tanggal menjadi YYYYMMDD
        
        // Query untuk menghitung jumlah aplikasi yang dibuat pada hari yang sama
        const [countResult] = await db.execute(
            'SELECT COUNT(*) as count FROM lay_penyandang_disabilitas WHERE DATE(submit_at) = ?',
            [formattedDate]
        );

        let count = countResult[0].count + 1; // Increment count for the current submission
        let no_lay;
        let isUnique = false;

        // Loop to ensure no_lay is unique
        while (!isUnique) {
            no_lay = `RSG${formattedDate}${count.toString().padStart(3, '0')}`;

            const [existingNoLay] = await db.execute(
                'SELECT COUNT(*) as count FROM lay_penyandang_disabilitas WHERE no_lay = ?',
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
            'INSERT INTO lay_penyandang_disabilitas (no_lay, user_nik, ktp, identitas_anak, kk, bpjs, jns_disabilitas, kebutuhan, submit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                no_lay,
                user_nik,
                JSON.stringify(filePaths.ktp),
                JSON.stringify(filePaths.identitas_anak),
                JSON.stringify(filePaths.kk),
                JSON.stringify(filePaths.bpjs),
                jns_disabilitas, 
                kebutuhan,
            ]
        );

        res.status(201).json({ message: 'Data telah disimpan', id: result.insertId, no_lay });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});




module.exports = router;

