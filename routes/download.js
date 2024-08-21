const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const router = express.Router();

router.get('/download-file/:table/:id/:type', async (req, res) => {
    const { table, id, type } = req.params;

    try {
        // Fetch data from the database
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

        // Generate URLs for each file and send back as JSON
        const fileURLs = dataType.map(element => {
            const absolutePath = path.join('', element);
            if (fs.existsSync(absolutePath)) {
                return `${req.protocol}://${req.get('host')}/${element.replace(/\\/g, '/')}`;
            } else {
                console.error('File tidak ditemukan:', absolutePath);
                return null;
            }
        }).filter(url => url !== null);

        if (fileURLs.length === 0) {
            return res.status(404).json({ error: 'File tidak ditemukan' });
        }

        return res.json(fileURLs);
    } catch (error) {
        console.error('Kesalahan:', error);
        res.status(500).json({ error: 'Kesalahan Internal Server' });
    }
});

module.exports = router;
