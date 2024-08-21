const express = require('express');
const cors = require('cors');
const session = require('express-session');
const registerRoute = require('./routes/register');
const loginRoute = require('./routes/login');
const logoutRoute = require('./routes/logout');
const userRoute = require('./routes/user');
const bantuanLogistikRoute = require('./routes/layanan/bantuanLogistik'); // Impor rute upload
const santunanKematianRoute = require('./routes/layanan/santunanKematian'); // Impor rute upload
const sktRoute = require('./routes/layanan/skt'); // Impor rute upload
const sioRoute = require('./routes/layanan/sio'); // Impor rute upload
const pubRoute = require('./routes/layanan/pub'); // Impor rute upload
const rumahSinggahRoute = require('./routes/layanan/rumahSinggah'); // Impor rute upload
const rehabilitasiLansiaRoute = require('./routes/layanan/rehabilitasiLansia'); // Impor rute upload
const rehabilitasiAnakRoute = require('./routes/layanan/rehabilitasiAnak'); // Impor rute upload
const penyandangDisabilitasRoute = require('./routes/layanan/penyandangDisabilitas'); // Impor rute upload
const pengangkatanAnakRoute = require('./routes/layanan/pengangkatanAnak'); // Impor rute upload
const dtksRoute = require('./routes/layanan/dtks'); // Impor rute upload
const pbijkRoute = require('./routes/layanan/pbijk'); // Impor rute upload
const refreshTokenRoute = require('./routes/refreshToken');
const db = require('./config/db'); // Impor db.js
const forgotPasswordRoute = require('./routes/forgot-password');
const downloadRoute = require('./routes/download');
const pengaduanRoute = require('./routes/layanan/pengaduan');
const informasiRoute = require('./routes/layanan/informasi');
const notifikasiRoute = require('./routes/notifikasi');
const templateRoute = require('./routes/layanan/template');

const app = express();

app.use(express.json());

// Set up CORS to allow requests from frontend
app.use(cors({
    origin: 'http://localhost:5173', // Ganti dengan URL frontend Anda
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true // Mengizinkan kredensial (cookie) untuk dikirim
}));

// Middleware to set CORS headers for static files
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});

// Serve static files
app.use('/uploads', express.static('uploads'));

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set ke true jika menggunakan HTTPS
}));

// Mount routes
app.use('/api/', registerRoute);
app.use('/api/', loginRoute);
app.use('/api/', logoutRoute);
app.use('/api/', userRoute);
app.use('/api/', bantuanLogistikRoute); 
app.use('/api/', santunanKematianRoute); 
app.use('/api/', sktRoute); 
app.use('/api/', sioRoute); 
app.use('/api/', pubRoute); 
app.use('/api/', rumahSinggahRoute); 
app.use('/api/', rehabilitasiLansiaRoute); 
app.use('/api/', rehabilitasiAnakRoute); 
app.use('/api/', penyandangDisabilitasRoute); 
app.use('/api/', pengangkatanAnakRoute); 
app.use('/api/', dtksRoute); 
app.use('/api/', pbijkRoute); 
app.use('/api', refreshTokenRoute);
app.use('/api', forgotPasswordRoute);
app.use('/api', downloadRoute);
app.use('/api', pengaduanRoute);
app.use('/api', informasiRoute);
app.use('/api', notifikasiRoute);
app.use('/api', templateRoute);


const PORT = process.env.PORT || 4121;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
