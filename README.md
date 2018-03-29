![](http://res.cloudinary.com/adonisjs/image/upload/q_100/v1522328931/adonis-persona_qlb1ix.svg)

> Opinionated user management service for AdonisJs

Since AdonisJs is all about removing redundant code from your code base. This add-on is another attempt for same.


## What is Persona?

Persona is a simple functional service to let you **create**, **verify** and **update** user profiles.

Persona is not for everyone, if your login system is too complex and rely on many factors, then Persona is not for you. **However, persona works great for majority of use cases**.

## What is does?
1. It helps you in registering new users.
2. Generate email verification token.
3. Validate credentials on login.
4. On email change, set the user account to `pending` state and re-generate the email verification token.
5. Allow password change.
6. Allow forget password.

## What is doesn't?

1. Do not generate any routes, controllers or views for you.
2. Do not send emails. However emit events that you can catch and send emails.
3. Doesn't set any sessions or generate JWT tokens


## Setup
Run the following command to grab the add-on from npm.

```bash
adonis install @adonisjs/persona

# for yarn
adonis install @adonisjs/persona --yarn
```

And then register the provider inside the providers array.

```js
const providers = [
  '@adonisjs/persona/providers/PersonaProvider'
]
```

And then you can access it as follows

```js
const Persona = use('Persona')
```

## Config

The config file is saved as `config/persona.js`. 

| Key | Value | Description |
|-----|--------|------------|
| uids | ['email'] | An array of database columns, that will be used as `uids`. If your system allows, `username` and `emails` both, then simply add them to this array.
| email | email | The field to be used as email. Everytime user changes the value of this field, their account will be set to `pending` state.
| password | password | The field to be used as password.
| model | App/Models/User | The user model to be used.
| newAccountState | pending | What is the account state of the user, when they first signup.
| verifiedAccountState | active | The account state of the user when they verify their email address
| dateFormat | YYYY-MM-DD HH:mm:ss | Your database date format, required for finding if the token has been expired or not.
| validationMessages | function | A function that returns an object of messages to be used for validation. It is same the validator custom messages.

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

> The optional `callback` is invoked with the original payload, just before the user is saved to the database. So this is your chance to attach any other properties to the payload.

The register method takes the user input data and perform following actions on it.

1. Validate that all `uids` are unique.
2. Email is unique and is a valid email address.
3. Password is confirmed.
4. Creates user account with the `account_status = pending`.
5. Generate and save email verification token inside the `tokens` table.
5. Emits `user::created` event. You can listen this event to send an email to the user.

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

>  The optional `callback` is invoked with the user instance, just before the password verification. So this is your chance to check for `userRole` or any other property you want.

Verify the user credentials. The value of `uid` will be checked against all the `uids`.

```js
async login ({ request, auth, response }) {
  const payload = request.only(['uid', 'password'])
  const user = await Persona.verify(payload)

  await auth.login(user)
  response.redirect('/dashboard')
})
```

#### verifyEmail(token)

Verify user email using the token. Ideally it will be after someone clicks a URL from their email address.

1. It will remove the token from the tokens table.
2. Set user `account_status = active`.

```js
async verifyEmail ({ params, session, response }) {
  const user = await Persona.verifyEmail(params.token)

  session.flash({ message: 'Email verified' })
  response.redirect('back')
})
```

#### updateProfile(user, payload)

Updates the user columns inside the database. However, if email is changed, then it will perform following steps.

> Note this method will throw exception if user is trying to change the password.

1. Set user `account_status = pending`.
2. Generate email verification token.
3. Fire `email::changed` event.

```js
async update ({ request, auth }) {
  const payload = request.only(['firstname', 'email'])
  const user = auth.user
  await Persona.updateProfile(user, payload)
})
```

#### updatePassword(user, payload)

Updates the user password by performing following steps.

1. Ensure `old_password` matches the user password.
2. New password is confirmed.
3. Updates the user password
4. Fires `password::changed` event. You can use this event to send an email about password change.

```js
async updatePassword ({ request, auth }) {
  const payload = request.only(['old_password', 'password', 'password_confirmation'])
  const user = auth.user
  await Persona.updatePassword(user, payload)
})
```

#### forgotPassword(uid)

Take a forgot password request from the user by passing their `uid`. Uid will be matched for all the `uids` inside the config file.

1. Find a user with the matching uid.
2. Generate password change token.
3. Emit `forgot::password` event. You can use this event to send the email with the token to reset the password.

```js
forgotPassword ({ request }) {
  await Persona.forgotPassword(request.input('uid'))
}
```

#### updatePasswordByToken(token, payload)

Update the user password by using a token. This method will perform following checks.

1. Make sure token is valid and not expired.
2. Ensure password is confirmed.
3. Update user password.

```js
updatePasswordByToken ({ request, params }) {
  const token = params.token
  const payload = request.only(['password', 'password_confirmation'])
  
  const user = await Persona.updatePasswordByToken(payload)
}
```

## Custom messages
You can define a function inside `config/persona.js` file, which returns an object of messages to be used as validation messages. The syntax is same as the `Validator` custom messages.

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

Below is the list of events emitted at different occasion. 

| Event | Payload | Description |
|--------|--------|-------------|
| user::created | `{ user, token }` | Emitted when a new user is created |
| email::changed | `{ user, oldEmail, token }` | Emitted when user changes their email address
| password::changed | `{ user }` | When user change their password by providing the old password |
| forgot::password | `{ user, token }` | Emitted when user asks for a token to change their password.
| password::recovered | `{ user }` | Emitted when user password is changed using the token |

## Exceptions raised

The entire API is driven by exceptions, which means you will hardly have to write `if/else` statements.

This is great, since Adonis allows managing response by catching exceptions globally.

#### ValidationException
The validation exception is raised when validation fails. If you are already handling `Validator` exceptions, then you won't have to do anything special.

#### InvalidTokenException
Raised when the token user is using to verify their email, or reset password is invalid.
