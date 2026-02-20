const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

require('dotenv').config({ quiet: true })

exports.default = async function (config) {
  if (!config?.path) return console.error('Missing config.path'), false

  const filePath = config.path
  const fileExt = path.extname(filePath).toLowerCase()
  if (!['.exe', '.dll'].includes(fileExt)) {
    console.log(`Skipping non-EXE/DLL: ${filePath}`)
    return true
  }

  const username = process.env.SSL_COM_USERNAME
  const password = process.env.SSL_COM_PASSWORD
  const credentialId = process.env.SSL_COM_CREDENTIAL_ID
  const totpSecretRaw = process.env.SSL_COM_TOTP_SECRET
  const codeSignToolPath = process.env.CODE_SIGN_TOOL_PATH || path.join(os.homedir(), 'bin', 'CodeSignTool')

  if (!username || !password || !credentialId || !totpSecretRaw) {
    console.error('Missing signing environment variables')
    return false
  }

  const totpSecret = totpSecretRaw.includes('secret=') ? totpSecretRaw.split('secret=')[1].split('&')[0] : totpSecretRaw

  if (!fs.existsSync(codeSignToolPath)) {
    console.error('CodeSignTool not found:', codeSignToolPath)
    return false
  }

  // Determine the correct executable based on platform
  const isWindows = process.platform === 'win32'
  const executableName = isWindows ? 'CodeSignTool.bat' : 'CodeSignTool.sh'
  const codeSignToolExecutable = path.join(codeSignToolPath, executableName)

  if (!fs.existsSync(codeSignToolExecutable)) {
    console.error(`CodeSignTool executable not found: ${codeSignToolExecutable}`)
    return false
  }

  console.log(`Signing with SSL.com CodeSignTool (${isWindows ? 'Windows' : 'Unix'})...`)

  try {
    // Get absolute path of the file to sign
    const absoluteInputPath = path.resolve(filePath)

    // Create temporary directories for input and output files with simple names
    const tempDir = path.join(os.tmpdir(), 'codesign-' + crypto.randomBytes(8).toString('hex'))
    const tempInDir = path.join(tempDir, 'in')
    const tempOutDir = path.join(tempDir, 'out')

    fs.mkdirSync(tempInDir, { recursive: true })
    fs.mkdirSync(tempOutDir, { recursive: true })

    // Copy the file to temp input dir with a simple name (no spaces)
    const tempInFile = path.join(tempInDir, `app${fileExt}`)
    fs.copyFileSync(absoluteInputPath, tempInFile)

    // Create the command to sign the temp file
    const cmd = isWindows
      ? `"${executableName}" sign /username="${username}" /password="${password.replace(/"/g, '\\"')}" /credential_id="${credentialId}" /totp_secret="${totpSecret}" /input_file_path="${tempInFile}" /output_dir_path="${tempOutDir}"`
      : `./${executableName} sign -username="${username}" -password="${password.replace(/"/g, '\\"')}" -credential_id="${credentialId}" -totp_secret="${totpSecret}" -input_file_path="${tempInFile}" -output_dir_path="${tempOutDir}"`

    // Execute the command from within the CodeSignTool directory
    execSync(cmd, {
      stdio: 'inherit',
      cwd: codeSignToolPath,
      shell: isWindows ? true : '/bin/bash',
    })

    // Get the signed file path
    const signedFilePath = path.join(tempOutDir, path.basename(tempInFile))

    if (!fs.existsSync(signedFilePath)) {
      throw new Error(`Signed file not found at expected location: ${signedFilePath}`)
    }

    // Verify the file sizes differ to confirm signing actually happened
    const originalSize = fs.statSync(tempInFile).size
    const signedSize = fs.statSync(signedFilePath).size

    if (originalSize === signedSize) {
      console.warn(
        `Warning: Original file (${originalSize} bytes) and signed file (${signedSize} bytes) have identical sizes - signing may have failed!`,
      )
    } else {
      console.log(`File size before: ${originalSize} bytes, after: ${signedSize} bytes - signing successful`)
    }

    // Replace the original file with the signed one
    fs.copyFileSync(signedFilePath, absoluteInputPath)

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })

    console.log('Successfully signed:', filePath)
    return true
  } catch (err) {
    console.error('Signing failed:', err.message)
    return false
  }
}
