const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
// const authenticateUser = require('../../middleware/authenticateUser'); // Pastikan jalur ini benar
const AdmZip = require('adm-zip');
const archiver = require('archiver');
const router = express.Router();

router.get('/download-file/:table/:id/:type', async (req, res) => {
    const { table, id, type } = req.params;

    try {
        // Ambil data dari database
        const [rows] = await db.execute(
            `SELECT ${type} FROM ${table} WHERE id = ?`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Data tidak ditemukan' });
        }

        const rawData = rows[0][type];
        console.log('Data dari database:', rawData);

        let dataType;
        try {
            dataType = JSON.parse(rawData);
        } catch (parseError) {
            console.error('Kesalahan saat parsing JSON:', parseError);
            return res.status(500).json({ error: 'Data tidak valid' });
        }

        // Set up the zip stream
        const archive = archiver('zip', {
            zlib: { level: 9 } // Level kompresi
        });

        // Dengarkan kesalahan pada arsip
        archive.on('error', (err) => {
            console.error('Kesalahan saat membuat arsip:', err);
            res.status(500).json({ error: 'Kesalahan saat membuat arsip' });
        });

        // Setel header respon
        res.attachment('files.zip');

        // Pipe data arsip ke respon
        archive.pipe(res);

        // Tambahkan file ke arsip
        dataType.forEach(element => {
            const absolutePath = path.join('', element);
            console.log('Menambahkan file ke arsip:', absolutePath);
            if (fs.existsSync(absolutePath)) {
                archive.file(absolutePath, { name: path.basename(absolutePath) });
            } else {
                console.error('File tidak ditemukan:', absolutePath);
            }
        });

        // Selesaikan arsip (tidak ada file lagi yang akan ditambahkan)
        await archive.finalize();
        console.log('Proses pengarsipan selesai');
        
    } catch (error) {
        console.error('Kesalahan:', error);
        res.status(500).json({ error: 'Kesalahan Internal Server' });
    }
});

module.exports = router;