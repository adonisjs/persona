'use strict'

/**
 * adonis-persona
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const moment = require('moment')
const randtoken = require('rand-token')
const GE = require('@adonisjs/generic-exceptions')

/**
 * Raised when token is invalid or expired
 *
 * @class InvalidTokenException
 */
class InvalidTokenException extends GE.LogicalException {
  static invalidToken () {
    return new this('The token is invalid or expired', 400)
  }
}

/**
 * The personna class is used to manage the user profile
 * creation, verification and updation with ease.
 *
 * @class Persona
 *
 * @param {Object} Config
 * @param {Object} Validator
 * @param {Object} Event
 * @param {Object} Hash
 */
class Persona {
  constructor (Config, Validator, Event, Encryption, Hash) {
    this.config = Config.merge('persona', {
      uids: ['email'],
      email: 'email',
      password: 'password',
      model: 'App/Models/User',
      newAccountState: 'pending',
      verifiedAccountState: 'active',
      dateFormat: 'YYYY-MM-DD HH:mm:ss'
    })

    /**
     * Varients of password fields
     */
    this._oldPasswordField = `old_${this.config.password}`
    this._passwordConfirmationField = `${this.config.password}_confirmation`

    this.Hash = Hash
    this.Event = Event
    this.Validator = Validator

    this._encrypter = Encryption.getInstance({ hmac: false })
    this._model = null
  }

  /**
   * Returns the email value from an object
   *
   * @method _getEmail
   *
   * @param  {Object}      payload
   *
   * @return {String}
   *
   * @private
   */
  _getEmail (payload) {
    return payload[this.config.email]
  }

  /**
   * Returns the password value from an object
   *
   * @method _getPassword
   *
   * @param  {Object}         payload
   *
   * @return {String}
   *
   * @private
   */
  _getPassword (payload) {
    return payload[this.config.password]
  }

  /**
   * Updates email field value on an object
   *
   * @method _setEmail
   *
   * @param  {Object}  payload
   * @param  {String}  email
   *
   * @private
   */
  _setEmail (payload, email) {
    payload[this.config.email] = email
  }

  /**
   * Sets password field value on an object
   *
   * @method _setPassword
   *
   * @param  {Object}     payload
   * @param  {String}     password
   *
   * @private
   */
  _setPassword (payload, password) {
    payload[this.config.password] = password
  }

  /**
   * Makes the custom message for a given key
   *
   * @method _makeCustomMessage
   *
   * @param  {String}           key
   * @param  {Object}           data
   * @param  {String}           defaultValue
   *
   * @return {String}
   *
   * @private
   */
  _makeCustomMessage (key, data, defaultValue) {
    const customMessage = this.getMessages()[key]
    if (!customMessage) {
      return defaultValue
    }

    return customMessage.replace(/{{\s?(\w+)\s?}}/g, (match, group) => {
      return data[group] || ''
    })
  }

  /**
   * Adds query constraints to pull the right token
   *
   * @method _addTokenConstraints
   *
   * @param  {Object}            query
   * @param  {String}            type
   *
   * @private
   */
  _addTokenConstraints (query, type) {
    query
      .where('type', type)
      .where('is_revoked', false)
      .where('updated_at', '>=', moment().subtract(24, 'hours').format(this.config.dateFormat))
  }

  /**
   * Generates a new token for a user and given type. Ideally
   * tokens will be for verifying email and forgot password
   *
   * @method generateToken
   *
   * @param  {Object}      user
   * @param  {String}      type
   *
   * @return {String}
   *
   * @example
   * ```
   * const user = await User.find(1)
   * const token = await Persona.generateToken(user, 'email')
   * ```
   */
  async generateToken (user, type) {
    const query = user.tokens()
    this._addTokenConstraints(query, type)

    const row = await query.first()
    if (row) {
      return row.token
    }

    const token = this._encrypter.encrypt(randtoken.generate(16))
    await user.tokens().create({ type, token })
    return token
  }

  /**
   * Returns the token instance along with releated
   * users
   *
   * @method getToken
   *
   * @param  {String} token
   * @param  {String} type
   *
   * @return {Object|Null}
   *
   * @example
   * ```
   * const token = request.input('token')
   * const tokenRow = await Persona.getToken(token, 'email')
   *
   * if (!tokenRow) {
   *   // token is invalid or expired
   * }
   *
   * const user = tokenRow.getRelated('user')
   * ```
   */
  async getToken (token, type) {
    const query = this.getModel().prototype.tokens().RelatedModel.query()
    this._addTokenConstraints(query, type)

    const row = await query.where('token', token).with('user').first()
    return row && row.getRelated('user') ? row : null
  }

  /**
   * Remvoes the token from the tokens table
   *
   * @method removeToken
   *
   * @param  {String}    token
   * @param  {String}    type
   *
   * @return {void}
   */
  async removeToken (token, type) {
    const query = this.getModel().prototype.tokens().RelatedModel.query()
    await query.where('token', token).where('type', type).delete()
  }

  /**
   * Returns the model class
   *
   * @method getModel
   *
   * @return {Model}
   */
  getModel () {
    if (!this._model) {
      this._model = use(this.config.model)
    }
    return this._model
  }

  /**
   * Returns an object of messages to be used for validation
   * failures
   *
   * @method getMessages
   *
   * @param {String} action
   *
   * @return {Object}
   */
  getMessages (action) {
    return typeof (this.config.validationMessages) === 'function' ? this.config.validationMessages(action) : {}
  }

  /**
   * Returns the table in user
   *
   * @method getTable
   *
   * @return {String}
   */
  getTable () {
    return this.getModel().table
  }

  /**
   * Returns an object of registration rules
   *
   * @method registerationRules
   *
   * @return {Object}
   *
   * @deprecated
   */
  registerationRules (payload) {
    console.warn('The \'registerationRules\' method is deprecated. Use \'registrationRules\' instead')
    return this.registrationRules(payload)
  }

  /**
   * Returns an object of registration rules
   *
   * @method registrationRules
   *
   * @return {Object}
   */
  registrationRules () {
    return this.config.uids.reduce((result, uid) => {
      const rules = ['required']
      if (uid === this.config.email) {
        rules.push('email')
      }

      rules.push(`unique:${this.getTable()},${uid}`)

      result[uid] = rules.join('|')
      return result
    }, {
      [this.config.password]: 'required|confirmed'
    })
  }

  /**
   * Returns the validation rules for updating email address
   *
   * @method updateEmailRules
   *
   * @param  {String}         userId
   *
   * @return {Object}
   */
  updateEmailRules (userId) {
    if (!userId) {
      throw new Error('updateEmailRules needs the current user id to generate the validation rules')
    }

    return {
      [this.config.email]: `required|email|unique:${this.getTable()},${this.config.email},${this.getModel().primaryKey},${userId}`
    }
  }

  /**
   * Returns the validation rules for updating the passowrd
   *
   * @method updatePasswordRules
   *
   * @param {Boolean} enforceOldPassword
   *
   * @return {Object}
   */
  updatePasswordRules (enforceOldPassword = true) {
    const rules = {
      [this.config.password]: 'required|confirmed'
    }

    /**
     * Enforcing to define old password
     */
    if (enforceOldPassword) {
      rules[this._oldPasswordField] = 'required'
    }

    return rules
  }

  /**
   * Returns an object of loginRules
   *
   * @method loginRules
   *
   * @return {String}
   */
  loginRules () {
    return {
      'uid': 'required',
      [this.config.password]: 'required'
    }
  }

  /**
   * Mutates the registration payload in the shape that
   * can be inserted to the database
   *
   * @method massageRegisterationData
   *
   * @param  {Object} payload
   *
   * @return {void}
   *
   * @deprecated
   */
  massageRegisterationData (payload) {
    console.warn('The \'massageRegisterationData\' method is deprecated. Use \'massageRegistrationData\' instead')
    return this.massageRegistrationData(payload)
  }

  /**
   * Mutates the registration payload in the shape that
   * can be inserted to the database
   *
   * @method massageRegistrationData
   *
   * @param  {Object}                 payload
   *
   * @return {void}
   */
  massageRegistrationData (payload) {
    delete payload[this._passwordConfirmationField]
    payload.account_status = this.config.newAccountState
  }

  /**
   * Runs validations using the validator and throws error
   * if validation fails
   *
   * @method runValidation
   *
   * @param  {Object}      payload
   * @param  {Object}      rules
   * @param  {String}      action
   *
   * @return {void}
   *
   * @throws {ValidationException} If validation fails
   */
  async runValidation (payload, rules, action) {
    const validation = await this.Validator.validateAll(payload, rules, this.getMessages(action))

    if (validation.fails()) {
      throw this.Validator.ValidationException.validationFailed(validation.messages())
    }
  }

  /**
   * Verifies two password and throws exception when they are not
   * valid
   *
   * @method verifyPassword
   *
   * @param  {String}       newPassword
   * @param  {String}       oldPassword
   * @param  {String}       [field = this.config.password]
   *
   * @return {void}
   */
  async verifyPassword (newPassword, oldPassword, field = this.config.password) {
    const verified = await this.Hash.verify(newPassword, oldPassword)
    if (!verified) {
      const data = { field, validation: 'mis_match', value: newPassword }
      throw this.Validator.ValidationException.validationFailed([
        {
          message: this._makeCustomMessage(`${field}.mis_match`, data, 'Invalid password'),
          field: field,
          validation: 'mis_match'
        }
      ])
    }
  }

  /**
   * Finds the user by looking for any of the given uids
   *
   * @method getUserByUids
   *
   * @param  {String}      value
   *
   * @return {Object}
   */
  async getUserByUids (value) {
    const userQuery = this.getModel().query()

    /**
     * Search for all uids to allow login with
     * any identifier
     */
    this.config.uids.forEach((uid) => userQuery.orWhere(uid, value))

    /**
     * Search for user
     */
    const user = await userQuery.first()
    if (!user) {
      const data = { field: 'uid', validation: 'exists', value }

      throw this.Validator.ValidationException.validationFailed([
        {
          message: this._makeCustomMessage('uid.exists', data, 'Unable to locate user'),
          field: 'uid',
          validation: 'exists'
        }
      ])
    }

    return user
  }

  /**
   * Creates a new user account and email verification token
   * for them.
   *
   * This method will fire `user::created` event.
   *
   * @method register
   *
   * @param  {Object}   payload
   * @param  {Function} callback
   *
   * @return {User}
   *
   * @example
   * ```js
   * const payload = request.only(['email', 'password', 'password_confirmation'])
   * await Persona.register(payload)
   * ```
   */
  async register (payload, callback) {
    await this.runValidation(payload, this.registrationRules(), 'register')
    this.massageRegistrationData(payload)

    if (typeof (callback) === 'function') {
      await callback(payload)
    }

    const user = await this.getModel().create(payload)

    /**
     * Get email verification token for the user
     */
    const token = await this.generateToken(user, 'email')

    /**
     * Fire new::user event to app to wire up events
     */
    this.Event.fire('user::created', { user, token })

    return user
  }

  /**
   * Verifies user credentials
   *
   * @method verify
   *
   * @param  {Object} payload
   * @param  {Function} callback
   *
   * @return {User}
   *
   * @example
   * ```js
   * const payload = request.only(['uid', 'password'])
   * await Persona.verify(payload)
   * ```
   */
  async verify (payload, callback) {
    await this.runValidation(payload, this.loginRules(), 'verify')
    const user = await this.getUserByUids(payload.uid)

    const enteredPassword = this._getPassword(payload)
    const userPassword = this._getPassword(user)

    if (typeof (callback) === 'function') {
      await callback(user, enteredPassword)
    }

    await this.verifyPassword(enteredPassword, userPassword)

    return user
  }

  /**
   * Verifies the user email address using a unique
   * token associated to their account
   *
   * @method verifyEmail
   *
   * @param  {String}    token
   *
   * @return {User}
   *
   * @example
   * ```js
   * const token = request.input('token')
   * await Persona.verifyEmail(token)
   * ```
   */
  async verifyEmail (token) {
    const tokenRow = await this.getToken(token, 'email')
    if (!tokenRow) {
      throw InvalidTokenException.invalidToken()
    }

    const user = tokenRow.getRelated('user')

    /**
     * Update user account only when in the newAccountState
     */
    if (user.account_status === this.config.newAccountState) {
      user.account_status = this.config.verifiedAccountState
      this.removeToken(token, 'email')
      await user.save()
    }

    return user
  }

  /**
   * Updates the user email address and fires an event for same. This
   * method will fire `email::changed` event.
   *
   * @method updateEmail
   *
   * @param  {Object}    user
   * @param  {String}    newEmail
   *
   * @return {User}
   *
   * @example
   * ```js
   * const user = auth.user
   * const newEmail = request.input('email')
   *
   * if (user.email !== newEmail) {
   *   await Persona.updateEmail(user, newEmail)
   * }
   * ```
   */
  async updateEmail (user, newEmail) {
    await this.runValidation({ [this.config.email]: newEmail }, this.updateEmailRules(user.primaryKeyValue), 'emailUpdate')

    const oldEmail = this._getEmail(user)

    /**
     * Updating user details
     */
    user.account_status = this.config.newAccountState
    this._setEmail(user, newEmail)
    await user.save()

    /**
     * Getting a new token for verifying the email and firing
     * the event
     */
    const token = await this.generateToken(user, 'email')
    this.Event.fire('email::changed', { user, oldEmail, token })

    return user
  }

  /**
   * Update user profile. Updating passwords is not allowed here. Also
   * if email is provided, then this method will internally call
   * `updateEmail`.
   *
   * @method updateProfile
   *
   * @param  {Object}      user
   * @param  {Object}      payload
   *
   * @return {User}
   *
   * @example
   * ```js
   * const user = auth.user
   * const payload = request.only(['firstname', 'lastname', 'email'])
   *
   * await Persona.updateProfile(user, payload)
   * ```
   */
  async updateProfile (user, payload) {
    /**
     * Do not allow changing passwords here. Password flow needs
     * old password to be verified
     */
    if (this._getPassword(payload)) {
      throw new Error('Changing password is not allowed via updateProfile method. Instead use updatePassword')
    }

    const newEmail = this._getEmail(payload)
    const oldEmail = this._getEmail(user)

    /**
     * Update new props with the user attributes
     */
    user.merge(payload)

    if (newEmail !== undefined && oldEmail !== newEmail) {
      /**
       * We need to reset the user email, since we are calling
       * updateEmail and it needs user old email address
       */
      this._setEmail(user, oldEmail)
      await this.updateEmail(user, newEmail)
    } else {
      await user.save()
    }

    return user
  }

  /**
   * Updates the user password. This method will emit `password::changed` event.
   *
   * @method updatePassword
   *
   * @param  {Object}       user
   * @param  {Object}       payload
   *
   * @return {User}
   *
   * @example
   * ```js
   * const user = auth.user
   * const payload = request.only(['old_password', 'password', 'password_confirmation'])
   *
   * await Persona.updatePassword(user, payload)
   * ```
   */
  async updatePassword (user, payload) {
    await this.runValidation(payload, this.updatePasswordRules(), 'passwordUpdate')

    const oldPassword = payload[this._oldPasswordField]
    const newPassword = this._getPassword(payload)
    const existingOldPassword = this._getPassword(user)

    await this.verifyPassword(oldPassword, existingOldPassword, this._oldPasswordField)

    this._setPassword(user, newPassword)
    await user.save()

    this.Event.fire('password::changed', { user })

    return user
  }

  /**
   * Finds the user using one of their uids and then fires
   * `forgot::password` event with a temporary token
   * to update the password.
   *
   * @method forgotPassword
   *
   * @param  {String}       email
   *
   * @return {void}
   *
   * @example
   * ```js
   * const email = request.input('email')
   * await Persona.forgotPassword(email)
   * ```
   */
  async forgotPassword (uid) {
    const user = await this.getUserByUids(uid)
    const token = await this.generateToken(user, 'password')

    this.Event.fire('forgot::password', { user, token })
  }

  /**
   * Updates the password for user using a pre generated token. This method
   * will fire `password::recovered` event.
   *
   * @method updatePasswordByToken
   *
   * @param  {String}              token
   * @param  {Object}              payload
   *
   * @return {User}
   *
   * @example
   * ```js
   * const token = request.input('token')
   * const payload = request.only(['password', 'password_confirmation'])
   *
   * await Persona.updatePasswordByToken(token, payload)
   * ```
   */
  async updatePasswordByToken (token, payload) {
    await this.runValidation(payload, this.updatePasswordRules(false), 'passwordUpdate')

    const tokenRow = await this.getToken(token, 'password')
    if (!tokenRow) {
      throw InvalidTokenException.invalidToken()
    }

    const user = tokenRow.getRelated('user')
    this._setPassword(user, this._getPassword(payload))

    await user.save()
    await this.removeToken(token, 'password')

    this.Event.fire('password::recovered', { user })
    return user
  }
}

module.exports = Persona
