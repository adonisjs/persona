'use strict'

/**
 * adonis-persona
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const { ServiceProvider } = require('@adonisjs/fold')

class PersonaProvider extends ServiceProvider {
  register () {
    this.app.singleton('Adonis/Addons/Persona', (app) => {
      const Config = app.use('Adonis/Src/Config')
      const Event = app.use('Adonis/Src/Event')
      const Hash = app.use('Adonis/Src/Hash')
      const Encryption = app.use('Adonis/Src/Encryption')
      const Validator = app.use('Adonis/Addons/Validator')
      const Persona = require('../src/Persona')

      return new Persona(Config, Validator, Event, Encryption, Hash)
    })

    this.app.alias('Adonis/Addons/Persona', 'Persona')
  }
}

module.exports = PersonaProvider
