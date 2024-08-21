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
        const uploadPath = path.join('uploads/template');

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

router.put('/update-template', authenticateUser, upload.fields([
    { name: 'surat_permohonan_bantuan_logistik' },
    { name: 'surat_permohonan_santunan_kematian' },
    { name: 'surat_permohonan_lks', maxCount: 5 },
    { name: 'surat_pernyataan' },
]), async (req, res) => {
    const files = req.files;
    const id = 1;

    // Extract file paths for each type of file
    const suratPermohonanBantuanLogistikPaths = files['surat_permohonan_bantuan_logistik'] ? files['surat_permohonan_bantuan_logistik'].map(file => file.path) : [];
    const suratPermohonanSantunanKematianPaths = files['surat_permohonan_santunan_kematian'] ? files['surat_permohonan_santunan_kematian'].map(file => file.path) : [];
    const suratPermohonanLKSPaths = files['surat_permohonan_lks'] ? files['surat_permohonan_lks'].map(file => file.path) : [];
    const suratPernyataanPaths = files['surat_pernyataan'] ? files['surat_pernyataan'].map(file => file.path) : [];

    const query = `
        UPDATE template 
        SET 
            surat_permohonan_bantuan_logistik = ?, 
            surat_permohonan_santunan_kematian = ?, 
            surat_permohonan_lks = ?, 
            surat_pernyataan = ? 
        WHERE id = ?
    `;

    try {
        await db.query(query, [
            JSON.stringify(suratPermohonanBantuanLogistikPaths), 
            JSON.stringify(suratPermohonanSantunanKematianPaths), 
            JSON.stringify(suratPermohonanLKSPaths), 
            JSON.stringify(suratPernyataanPaths), 
            id
        ]);
        res.status(200).send('Template updated successfully');
    } catch (err) {
        console.error('Error updating template:', err);
        res.status(500).send('Error updating template');
    }
});


module.exports = router;

