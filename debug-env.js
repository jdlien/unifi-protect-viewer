require('dotenv').config()

console.log('Environment variables loaded:')
console.log('Username length:', process.env.SSL_COM_USERNAME ? process.env.SSL_COM_USERNAME.length : 'not set')
console.log('Password length:', process.env.SSL_COM_PASSWORD ? process.env.SSL_COM_PASSWORD.length : 'not set')
console.log('Credential ID:', process.env.SSL_COM_CREDENTIAL_ID)
console.log('TOTP Secret length:', process.env.SSL_COM_TOTP_SECRET ? process.env.SSL_COM_TOTP_SECRET.length : 'not set')

// Show first and last character of each to check for quotes
if (process.env.SSL_COM_USERNAME) {
  console.log(
    'Username first/last:',
    process.env.SSL_COM_USERNAME[0] + '...' + process.env.SSL_COM_USERNAME[process.env.SSL_COM_USERNAME.length - 1],
  )
}
if (process.env.SSL_COM_PASSWORD) {
  console.log(
    'Password first/last:',
    process.env.SSL_COM_PASSWORD[0] + '...' + process.env.SSL_COM_PASSWORD[process.env.SSL_COM_PASSWORD.length - 1],
  )
}
if (process.env.SSL_COM_CREDENTIAL_ID) {
  console.log(
    'Credential ID first/last:',
    process.env.SSL_COM_CREDENTIAL_ID[0] +
      '...' +
      process.env.SSL_COM_CREDENTIAL_ID[process.env.SSL_COM_CREDENTIAL_ID.length - 1],
  )
}
if (process.env.SSL_COM_TOTP_SECRET) {
  console.log(
    'TOTP Secret first/last:',
    process.env.SSL_COM_TOTP_SECRET[0] +
      '...' +
      process.env.SSL_COM_TOTP_SECRET[process.env.SSL_COM_TOTP_SECRET.length - 1],
  )
}
