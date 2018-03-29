'use strict'

/**
 * adonis-persona
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const path = require('path')

module.exports = async (cli) => {
  try {
    const inFile = path.join(__dirname, './config', 'index.js')
    const outFile = path.join(cli.helpers.configPath(), 'persona.js')
    await cli.copy(inFile, outFile)
    cli.command.completed('create', 'config/persona.js')
  } catch (error) {
    // ignore error
  }
}
