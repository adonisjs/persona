## Register provider
Register provider inside `start/app.js` file.

```js
const providers = [
  '@adonisjs/persona/providers/PersonaProvider'
]
```

And then you can access it as follows

```js
const Persona = use('Persona')
```
