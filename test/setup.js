'use strict'

/**
 * adonis-persona
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

process.env.SILENT_ENV = true

const path = require('path')
const { registrar, ioc } = require('@adonisjs/fold')
const { setupResolver, Helpers } = require('@adonisjs/sink')

module.exports = {
  wire: async function () {
    setupResolver()
    ioc.bind('Adonis/Src/Helpers', () => new Helpers(path.join(__dirname, '..', 'app')))

    await registrar.providers([
      '@adonisjs/framework/providers/AppProvider',
      '@adonisjs/lucid/providers/LucidProvider',
      '@adonisjs/validator/providers/ValidatorProvider'
    ]).registerAndBoot()

    ioc.singleton('App/Models/Token', (app) => {
      const Model = app.use('Model')
      class Token extends Model {
        user () {
          return this.belongsTo('App/Models/User')
        }
      }
      Token._bootIfNotBooted()
      return Token
    })

    ioc.singleton('App/Models/User', (app) => {
      const Model = app.use('Model')
      class User extends Model {
        tokens () {
          return this.hasMany('App/Models/Token')
        }

        static boot () {
          super.boot()
          this.addHook('beforeSave', async (userinstance) => {
            if (userinstance.dirty.password) {
              userinstance.password = await use('Hash').make(userinstance.dirty.password)
            }
          })
        }
      }
      User._bootIfNotBooted()
      return User
    })
  },

  async migrateUp () {
    await use('Database').schema.createTable('users', (table) => {
      table.increments()
      table.string('username').unique()
      table.string('email').unique().notNull()
      table.string('firstname').nullable()
      table.string('lastname').nullable()
      table.string('password').unique()
      table.enum('account_status', ['pending', 'active', 'inactive']).defaultsTo('pending')
      table.timestamps()
    })

    await use('Database').schema.createTable('tokens', (table) => {
      table.increments()
      table.integer('user_id')
      table.string('token').notNull()
      table.string('type').notNull()
      table.boolean('is_revoked').defaultsTo(false)
      table.timestamps()
    })
  },

  async migrateDown () {
    await use('Database').schema.dropTableIfExists('users')
    await use('Database').schema.dropTableIfExists('tokens')
  }
}
