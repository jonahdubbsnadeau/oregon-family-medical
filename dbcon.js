var mysql = require('mysql2/promise');

var pool = mysql.createPool({
    host:            '35.223.94.139',
    user:            'root',
    password:        'rqB38qh9LCD7oaP4',
    database:        'cs340'
});

module.exports.pool = pool;