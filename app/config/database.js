const path = require('path')

module.exports = {
  connection: 'sqlite',

  sqlite: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '../database.sqlite')
    }
  }
}
