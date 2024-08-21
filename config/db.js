// config/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'web_pelayanan'
});

module.exports = pool;




// const pool = mysql.createPool({
//   host: 'bakgghhx5etsvqz4hp6b-mysql.services.clever-cloud.com',
//   user: 'ulyjyzwpgkovityk',
//   password: 'rwZJ2flVCYLUVUUl6yZ0',
//   database: 'bakgghhx5etsvqz4hp6b'
// });

// host: 'bakgghhx5etsvqz4hp6b-mysql.services.clever-cloud.com',
//   user: 'ulyjyzwpgkovityk',
//   password: 'rwZJ2flVCYLUVUUl6yZ0',
//   database: 'bakgghhx5etsvqz4hp6b',
//   port: 3306