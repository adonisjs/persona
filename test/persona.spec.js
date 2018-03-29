'use strict'

const test = require('japa')
const moment = require('moment')

const setup = require('./setup')
const Persona = require('../src/Persona')

function getUser () {
  return use('App/Models/User')
}

test.group('Persona', (group) => {
  group.before(async () => {
    await setup.wire()
    await setup.migrateUp()
  })

  group.beforeEach(async () => {
    this.persona = new Persona(use('Config'), use('Validator'), use('Event'), use('Hash'))
    await use('Database').beginGlobalTransaction()
  })

  group.afterEach(() => {
    use('Database').rollbackGlobalTransaction()
  })

  group.after(async () => {
    await setup.migrateDown()
  })

  test('get registeration rules', async (assert) => {
    assert.deepEqual(this.persona.registerationRules(), {
      email: 'required|email|unique:users,email',
      password: 'required|confirmed'
    })
  })

  test('get registeration rules when uids are multiple', async (assert) => {
    this.persona.config.uids = ['username', 'email']

    assert.deepEqual(this.persona.registerationRules(), {
      email: 'required|email|unique:users,email',
      username: 'required|unique:users,username',
      password: 'required|confirmed'
    })
  })

  test('get login rules', async (assert) => {
    assert.deepEqual(this.persona.loginRules(), {
      uid: 'required',
      password: 'required'
    })
  })

  test('throw validation error when user email is missing', async (assert) => {
    assert.plan(1)

    try {
      await this.persona.register({})
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          message: 'required validation failed on password',
          field: 'password',
          validation: 'required'
        },
        {
          message: 'required validation failed on email',
          field: 'email',
          validation: 'required'
        }
      ])
    }
  })

  test('throw validation error when email is already taken', async (assert) => {
    await getUser().create({ email: 'virk@adonisjs.com' })
    assert.plan(1)

    try {
      await this.persona.register({
        email: 'virk@adonisjs.com',
        password: 'secret',
        password_confirmation: 'secret'
      })
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          message: 'unique validation failed on email',
          field: 'email',
          validation: 'unique'
        }
      ])
    }
  })

  test('create user account, token and emit event', async (assert) => {
    const Event = use('Event')
    Event.fake()

    const user = await this.persona.register({
      email: 'virk@adonisjs.com',
      password: 'secret',
      password_confirmation: 'secret'
    })

    const recentEvent = Event.pullRecent()
    assert.equal(recentEvent.event, 'user::created')
    assert.deepEqual(recentEvent.data[0].user, user)
    assert.exists(recentEvent.data[0].token)

    Event.restore()
    assert.equal(user.account_status, 'pending')
  })

  test('return error when during login uid or password is missing', async (assert) => {
    assert.plan(1)

    try {
      await this.persona.verify({
      })
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          message: 'required validation failed on uid',
          field: 'uid',
          validation: 'required'
        },
        {
          message: 'required validation failed on password',
          field: 'password',
          validation: 'required'
        }
      ])
    }
  })

  test('return error unable to locate user with given uids', async (assert) => {
    assert.plan(1)

    try {
      await this.persona.verify({
        uid: 'foo@bar.com',
        password: 'hello'
      })
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          message: 'Unable to locate user',
          field: 'uid',
          validation: 'exists'
        }
      ])
    }
  })

  test('return error when user password is incorrect', async (assert) => {
    await getUser().create({ email: 'foo@bar.com', password: 'secret' })
    assert.plan(1)

    try {
      await this.persona.verify({
        uid: 'foo@bar.com',
        password: 'hello'
      })
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          message: 'Invalid password',
          field: 'password',
          validation: 'mis_match'
        }
      ])
    }
  })

  test('return user when everything matches', async (assert) => {
    await getUser().create({ email: 'foo@bar.com', password: 'secret' })

    const verifiedUser = await this.persona.verify({
      uid: 'foo@bar.com',
      password: 'secret'
    })

    assert.equal(verifiedUser.id, 1)
  })

  test('return error when unable to find email token inside db', async (assert) => {
    assert.plan(2)

    try {
      await this.persona.verifyEmail('hello')
    } catch ({ message, name }) {
      assert.equal(message, 'The token is invalid or expired')
      assert.equal(name, 'InvalidTokenException')
    }
  })

  test('return error token is found but is expired', async (assert) => {
    const user = await getUser().create({ email: 'foo@bar.com' })

    await use('Database').table('tokens').insert({
      token: 'hello',
      type: 'email',
      user_id: user.id,
      is_revoked: false,
      created_at: moment().subtract(2, 'days').format('YYYY-MM-DD HH:mm:ss'),
      updated_at: moment().subtract(2, 'days').format('YYYY-MM-DD HH:mm:ss')
    })

    assert.plan(2)

    try {
      await this.persona.verifyEmail('hello')
    } catch ({ message, name }) {
      assert.equal(message, 'The token is invalid or expired')
      assert.equal(name, 'InvalidTokenException')
    }
  })

  test('return error token is found but of wrong type', async (assert) => {
    const user = await getUser().create({ email: 'foo@bar.com' })

    await use('Database').table('tokens').insert({
      token: 'hello',
      type: 'password',
      user_id: user.id,
      is_revoked: false,
      created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
      updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
    })

    assert.plan(2)

    try {
      await this.persona.verifyEmail('hello')
    } catch ({ message, name }) {
      assert.equal(message, 'The token is invalid or expired')
      assert.equal(name, 'InvalidTokenException')
    }
  })

  test('set user account to active when token is valid', async (assert) => {
    const user = await getUser().create({ email: 'foo@bar.com' })

    await use('Database').table('tokens').insert({
      token: 'hello',
      type: 'email',
      is_revoked: false,
      user_id: user.id,
      created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
      updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
    })

    await this.persona.verifyEmail('hello')

    await user.reload()
    assert.equal(user.account_status, 'active')
  })

  test('do not set to active when initial state is not pending', async (assert) => {
    const user = await getUser().create({ email: 'foo@bar.com', account_status: 'inactive' })

    await use('Database').table('tokens').insert({
      token: 'hello',
      type: 'email',
      is_revoked: false,
      user_id: user.id,
      created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
      updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
    })

    await this.persona.verifyEmail('hello')

    await user.reload()
    assert.equal(user.account_status, 'inactive')
  })

  test('throw error when trying to update password using updateProfile', async (assert) => {
    assert.plan(1)

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'inactive',
      password: 'secret'
    })

    try {
      await this.persona.updateProfile(user, { password: 'hello' })
    } catch ({ message }) {
      assert.equal(message, 'Changing password is not allowed via updateProfile method. Instead use updatePassword')
    }
  })

  test('update user profile', async (assert) => {
    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'inactive',
      password: 'secret'
    })

    await this.persona.updateProfile(user, { firstname: 'virk' })

    await user.reload()
    assert.equal(user.firstname, 'virk')
  })

  test('get updateEmail validation rules', async (assert) => {
    assert.deepEqual(this.persona.updateEmailRules(1), {
      email: 'email|unique:users,email,id,1'
    })
  })

  test('when updating email make sure its valid', async (assert) => {
    assert.plan(1)

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'inactive',
      password: 'secret'
    })

    try {
      await this.persona.updateProfile(user, { email: 'haha' })
    } catch (error) {
      assert.deepEqual(error.messages, [{
        message: 'email validation failed on email',
        field: 'email',
        validation: 'email'
      }])
    }
  })

  test('when updating email make sure its not taken by anyone else', async (assert) => {
    assert.plan(1)

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    await getUser().create({
      email: 'baz@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    try {
      await this.persona.updateProfile(user, { email: 'baz@bar.com' })
    } catch (error) {
      assert.deepEqual(error.messages, [{
        message: 'unique validation failed on email',
        field: 'email',
        validation: 'unique'
      }])
    }
  })

  test('set user account status to pending when email is changed', async (assert) => {
    const Event = use('Event')
    Event.fake()

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    await this.persona.updateProfile(user, { firstname: 'virk', email: 'baz@bar.com' })

    await user.reload()
    assert.equal(user.firstname, 'virk')
    assert.equal(user.account_status, 'pending')

    const recentEvent = Event.pullRecent()
    assert.equal(recentEvent.event, 'email::changed')
    assert.deepEqual(recentEvent.data[0].user, user)
    assert.deepEqual(recentEvent.data[0].oldEmail, 'foo@bar.com')
    assert.exists(recentEvent.data[0].token)
    Event.restore()

    const tokens = await user.tokens().fetch()
    assert.equal(tokens.size(), 1)
  })

  test('do not set account to pending when same email is set', async (assert) => {
    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    await this.persona.updateProfile(user, { firstname: 'virk', email: 'foo@bar.com' })

    await user.reload()
    assert.equal(user.firstname, 'virk')
    assert.equal(user.account_status, 'active')

    const tokens = await user.tokens().fetch()
    assert.equal(tokens.size(), 0)
  })

  test('get update password rules', async (assert) => {
    const rules = this.persona.updatePasswordRules()

    assert.deepEqual(rules, {
      old_password: 'required',
      password: 'required|confirmed'
    })
  })

  test('make sure old password is set', async (assert) => {
    assert.plan(1)

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    try {
      await this.persona.updatePassword(user, {})
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          field: 'password',
          validation: 'required',
          message: 'required validation failed on password'
        },
        {
          field: 'old_password',
          validation: 'required',
          message: 'required validation failed on old_password'
        }
      ])
    }
  })

  test('make sure old password is correct', async (assert) => {
    assert.plan(1)

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    try {
      await this.persona.updatePassword(user, { old_password: 'foo', password: 'newsecret', password_confirmation: 'newsecret' })
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          field: 'old_password',
          validation: 'mis_match',
          message: 'Invalid password'
        }
      ])
    }
  })

  test('update user password and fire password::changed event', async (assert) => {
    const Event = use('Event')
    Event.fake()

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    await this.persona.updatePassword(user, { old_password: 'secret', password: 'newsecret', password_confirmation: 'newsecret' })

    const recentEvent = Event.pullRecent()
    assert.equal(recentEvent.event, 'password::changed')
    assert.deepEqual(recentEvent.data[0].user, user)
    Event.restore()

    await user.reload()
    const verified = await use('Hash').verify('newsecret', user.password)
    assert.isTrue(verified)
  })

  test('return error when unable to locate user with the uid', async (assert) => {
    assert.plan(1)

    try {
      await this.persona.forgotPassword('foo@bar.com')
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          field: 'uid',
          message: 'Unable to locate user',
          validation: 'exists'
        }
      ])
    }
  })

  test('generate forget password token when able to locate user', async (assert) => {
    const Event = use('Event')
    Event.fake()

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    await user.reload()

    await this.persona.forgotPassword('foo@bar.com')

    const recentEvent = Event.pullRecent()
    assert.equal(recentEvent.event, 'forgot::password')
    assert.deepEqual(recentEvent.data[0].user.toJSON(), user.toJSON())
    assert.exists(recentEvent.data[0].token)

    Event.restore()

    const tokens = await user.tokens().fetch()
    assert.equal(tokens.size(), 1)
    assert.equal(tokens.first().token, recentEvent.data[0].token)
  })

  test('updatePasswordByToken make sure new password exists', async (assert) => {
    assert.plan(1)

    try {
      await this.persona.updatePasswordByToken('hello', {})
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          field: 'password',
          message: 'required validation failed on password',
          validation: 'required'
        }
      ])
    }
  })

  test('updatePasswordByToken make sure new password is confirmed', async (assert) => {
    assert.plan(1)

    try {
      await this.persona.updatePasswordByToken('hello', { password: 'foobar' })
    } catch (error) {
      assert.deepEqual(error.messages, [
        {
          field: 'password',
          message: 'confirmed validation failed on password',
          validation: 'confirmed'
        }
      ])
    }
  })

  test('updatePasswordByToken make sure new token is valid', async (assert) => {
    assert.plan(1)

    try {
      await this.persona.updatePasswordByToken('hello', { password: 'foobar', password_confirmation: 'foobar' })
    } catch ({ message }) {
      assert.equal(message, 'The token is invalid or expired')
    }
  })

  test('updatePasswordByToken make sure new token type is password', async (assert) => {
    assert.plan(1)

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    await use('Database').table('tokens').insert({
      token: 'hello',
      type: 'email',
      user_id: user.id,
      is_revoked: false,
      created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
      updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
    })

    try {
      await this.persona.updatePasswordByToken('hello', { password: 'foobar', password_confirmation: 'foobar' })
    } catch ({ message }) {
      assert.equal(message, 'The token is invalid or expired')
    }
  })

  test('updatePasswordByToken make sure new token is not expired', async (assert) => {
    assert.plan(1)

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    await use('Database').table('tokens').insert({
      token: 'hello',
      type: 'password',
      user_id: user.id,
      is_revoked: false,
      created_at: moment().subtract(2, 'days').format('YYYY-MM-DD HH:mm:ss'),
      updated_at: moment().subtract(2, 'days').format('YYYY-MM-DD HH:mm:ss')
    })

    try {
      await this.persona.updatePasswordByToken('hello', { password: 'foobar', password_confirmation: 'foobar' })
    } catch ({ message }) {
      assert.equal(message, 'The token is invalid or expired')
    }
  })

  test('update user password when token is valid', async (assert) => {
    const Event = use('Event')
    Event.fake()

    const user = await getUser().create({
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    await use('Database').table('tokens').insert({
      token: 'hello',
      type: 'password',
      user_id: user.id,
      is_revoked: false,
      created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
      updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
    })

    await this.persona.updatePasswordByToken('hello', { password: 'newsecret', password_confirmation: 'newsecret' })
    await user.reload()

    const recentEvent = Event.pullRecent()
    assert.equal(recentEvent.event, 'password::recovered')
    assert.deepEqual(recentEvent.data[0].user.toJSON(), user.toJSON())
    Event.restore()

    await user.reload()
    const verified = await use('Hash').verify('newsecret', user.password)
    assert.isTrue(verified)
  })

  test('get user when any of the uid matches', async (assert) => {
    await getUser().create({
      username: 'virk',
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    this.persona.config.uids = ['username', 'email']

    const user = await this.persona.getUserByUids('virk')
    const user1 = await this.persona.getUserByUids('foo@bar.com')

    assert.deepEqual(user.toJSON(), user1.toJSON())
  })

  test('generate token do not regenerate token when one already exists', async (assert) => {
    const user = await getUser().create({
      username: 'virk',
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    const token = await this.persona.generateToken(user, 'email')
    const token1 = await this.persona.generateToken(user, 'email')
    assert.equal(token, token1)
  })

  test('generate token do regenerate token when one of different types', async (assert) => {
    const user = await getUser().create({
      username: 'virk',
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    const token = await this.persona.generateToken(user, 'email')
    const token1 = await this.persona.generateToken(user, 'password')
    assert.notEqual(token, token1)
  })

  test('generate token do regenerate token when for different users', async (assert) => {
    const user = await getUser().create({
      username: 'virk',
      email: 'foo@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    const user1 = await getUser().create({
      username: 'nikk',
      email: 'nikk@bar.com',
      account_status: 'active',
      password: 'secret'
    })

    const token = await this.persona.generateToken(user, 'email')
    const token1 = await this.persona.generateToken(user1, 'email')
    assert.notEqual(token, token1)
  })
})
