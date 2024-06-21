// routes/logout.js
const express = require('express');
const router = express.Router();

router.post('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                return res.status(500).json({ msg: 'Logout failed' });
            }
            res.clearCookie('connect.sid'); // Clear the session cookie
            res.status(200).json({ msg: 'Logout successful' });
        });
    } else {
        res.status(200).json({ msg: 'No session to destroy' });
    }
});

module.exports = router;
