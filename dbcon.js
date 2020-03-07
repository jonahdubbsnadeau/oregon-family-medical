var mysql = require('mysql');

var pool = mysql.createPool({
    host:            'classmysql.engr.oregonstate.edu',
    user:            'cs340_dubbsnaj',
    password:        '8054',
    database:        'cs340_dubbsnaj'
});

module.exports.pool = pool;