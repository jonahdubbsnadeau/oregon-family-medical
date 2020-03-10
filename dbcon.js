var mysql = require('mysql2/promise');

var pool = mysql.createPool({
    socketPath:      '/cloudsql/responsive-icon-270702:us-central1:oregon-family-medical',
    user:            'root',
    password:        'rqB38qh9LCD7oaP4',
    database:        'cs340'
});

module.exports.pool = pool;