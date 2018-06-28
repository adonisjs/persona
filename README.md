![](http://res.cloudinary.com/adonisjs/image/upload/q_100/v1522328931/adonis-persona_qlb1ix.svg)

> Opinionated user management service for AdonisJs

**Make sure @adonisjs/framework version is >= 5.0.6**

AdonisJs is all about removing redundant code from your code base. This add-on tries to do the same.

## What is Persona?

Persona is a simple, functional service to let you **create**, **verify** and **update** user profiles.

Persona is not for everyone; if your login system is too complex and relies on many factors, Persona is not for you. **However, persona works great for most use cases**.

## What does it do?
1. Helps you register new users.
2. Generates email verification tokens.
3. Validates credentials on login.
4. On email change, sets the user account to a `pending` state and re-generates the email verification token.
5. Allows changing passwords.
6. Allows recovering forgotten passwords.

## What does it NOT do?
1. Does not generate any routes, controllers or views for you.
2. Does not send emails. However, it emits events that you can use to send emails.
3. Does not create sessions or generate JWT tokens.


## Setup
Run the following command to grab the add-on from npm:

```bash
adonis install @adonisjs/persona

# for yarn
adonis install @adonisjs/persona --yarn
```

Follow up by registering the provider inside the providers array:

```js
const providers = [
  '@adonisjs/persona/providers/PersonaProvider'
]
```

You may then access it as follows:

```js
const Persona = use('Persona')
```

## Config

The config file is saved as `config/persona.js`. 

| Key | Value | Description |
|-----|--------|------------|
| uids | ['email'] | An array of database columns that will be used as `uids`. If your system allows `username` and `emails` both, then simply add them to this array.
| email | email | The field to be used as email. Every time a user changes the value of this field, their account will be set to the `pending` state.
| password | password | The field to be used as password.
| model | App/Models/User | The user model to be used.
| newAccountState | pending | The default account state for new users.
| verifiedAccountState | active | The account state for users after verifying their email address.
| dateFormat | YYYY-MM-DD HH:mm:ss | Your database date format, required for determining if the token has been expired or not.
| validationMessages | function | A function that returns an object of messages to be used for validation. The syntax is the same as `Validator` custom messages.

## Constraints

There are some intentional constraints in place.

1. Only works with `Lucid` models.
2. The `App/Models/User` must have a relationship setup with `App/Models/Token` and vice-versa.
   
   ```js
   class User extends Model {
     tokens () {
       return this.hasMany('App/Models/Token')
     }
   }
   
   class Token extends Model {
     user () {
       return this.belongsTo('App/Models/User')
     }
   }
   ```
   
 3. User table must have a column called `account_status`.

## API

Let's go through the API of persona.

#### register(payload, [callback])

> The optional `callback` is invoked with the original payload just before the user is saved to the database. You can use it if you need to attach any other properties to the payload.

The register method takes the user input data and performs the following actions on it.

1. Validates that all `uids` are unique.
2. Checks that email is unique and is a valid email address.
3. Makes sure the password is confirmed.
4. Creates a new user account with the `account_status = pending`.
5. Generates and saves an email verification token inside the `tokens` table.
5. Emits a `user::created` event. You can listen for this event to send an email to the user.

> Make sure to use `querystring` module to encode the token when sending via Email.

```js
const Persona = use('Persona')

async register ({ request, auth, response }) {
  const payload = request.only(['email', 'password', 'password_confirmation'])

  const user = await Persona.register(payload)

  // optional
  await auth.login(user)
  response.redirect('/dashboard')
}
```

#### verify(payload, [callback])

>  The optional `callback` is invoked with the user instance just before the password verification. You can use it to check for `userRole` or any other property you want.

Verifies the user credentials. The value of `uid` will be checked against all the `uids`.

```js
async login ({ request, auth, response }) {
  const payload = request.only(['uid', 'password'])
  const user = await Persona.verify(payload)

  await auth.login(user)
  response.redirect('/dashboard')
})
```

#### verifyEmail(token)

Verifies the user's email using the token. Ideally that should be after someone clicks a URL from their email address.

1. Removes the token from the tokens table.
2. Set user `account_status = active`.

```js
async verifyEmail ({ params, session, response }) {
  const user = await Persona.verifyEmail(params.token)

  session.flash({ message: 'Email verified' })
  response.redirect('back')
})
```

#### updateProfile(user, payload)

Updates the user columns inside the database. However, if the email is changed, it performs the following steps:

> Please note that this method will throw an exception if the user is trying to change the password.

1. Sets the user's `account_status = pending`.
2. Generates an email verification token.
3. Fires the `email::changed` event.

```js
async update ({ request, auth }) {
  const payload = request.only(['firstname', 'email'])
  const user = auth.user
  await Persona.updateProfile(user, payload)
})
```

#### updatePassword(user, payload)

Updates the user's password by performing the following steps:

> Make sure to have the `beforeSave` hook in place for hashing the password. Otherwise
> the password will be saved as a plain string.

1. Ensures `old_password` matches the user's password.
2. Makes sure the new password is confirmed.
3. Updates the user password.
4. Fires the `password::changed` event. You can listen for this event to send an email about the password change.

```js
async updatePassword ({ request, auth }) {
  const payload = request.only(['old_password', 'password', 'password_confirmation'])
  const user = auth.user
  await Persona.updatePassword(user, payload)
})
```

#### forgotPassword(uid)

Takes a forgot password request from the user by passing their `uid`. Uid will be matched against all the `uids` inside the config file.

1. Finds a user with the matching uid.
2. Generates a password change token.
3. Emits the `forgot::password` event. You can listen for this event to send an email with the token to reset the password.

```js
forgotPassword ({ request }) {
  await Persona.forgotPassword(request.input('uid'))
}
```

#### updatePasswordByToken(token, payload)

Updates the user password using a token. This method performs the following checks:

1. Makes sure the token is valid and not expired.
2. Ensures the password is confirmed.
3. Updates the user's password.

```js
updatePasswordByToken ({ request, params }) {
  const token = params.token
  const payload = request.only(['password', 'password_confirmation'])
  
  const user = await Persona.updatePasswordByToken(token, payload)
}
```

## Custom messages
You can define a function inside the `config/persona.js` file, which returns an object of messages to be used as validation messages. The syntax is the same as `Validator` custom messages.

```js
{
  validationMessages (action) => {
    return {
      'email.required': 'Email is required',
      'password.mis_match': 'Invalid password'
    }
  }
}
```

The `validationMessages` method gets an `action` parameter. You can use it to customize the messages for different actions. Following is the list of actions.

1. register
2. login
3. emailUpdate
4. passwordUpdate

## Events emitted

Below is the list of events emitted at different occasions. 

| Event | Payload | Description |
|--------|--------|-------------|
| user::created | `{ user, token }` | Emitted when a new user is created |
| email::changed | `{ user, oldEmail, token }` | Emitted when a user changes their email address |
| password::changed | `{ user }` | Emitted when a user changes their password by providing the old password |
| forgot::password | `{ user, token }` | Emitted when a user asks for a token to change their password |
| password::recovered | `{ user }` | Emitted when a user's password is changed using the token |

## Exceptions raised

The entire API is driven by exceptions, which means you will hardly have to write `if/else` statements.

This is great, since Adonis allows managing responses by catching exceptions globally.

#### ValidationException
Raised when validation fails. If you are already handling `Validator` exceptions, you won't have to do anything special.

#### InvalidTokenException
Raised when a supplied token, to verify an email or reset password with, is invalid.

## Custom rules
At times, you may want to have custom set of rules when registering or login new users. You can override following methods for same.

The code can be added inside the hooks file or even in the registeration controller.

#### registerationRules

```js
Persona.registerationRules = function () {
  return {
    email: 'required|email|unique:users,email',
    password: 'required|confirmed'
  }
}
```

#### updateEmailRules
```js
Persona.updateEmailRules = function (userId) {
  return {
    email: `required|email|unique:users,email,id,${userId}`
  }
}
```

#### updatePasswordRules
```js
Persona.updatePasswordRules = function (enforceOldPassword = true) {
  if (!enforceOldPassword) {
    return {
      password: 'required|confirmed'
    }
  }

  return {
    old_password: 'required',
    password: 'required|confirmed'
  }
}
```

#### loginRules
```js
Persona.loginRules = function () {
  return {
    uid: 'required',
    password: 'required'
  }
}
```
