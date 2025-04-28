# Windows Code Signing for UniFi Protect Viewer

This document explains how to set up and use the Windows code signing scripts for UniFi Protect Viewer using SSL.com's CodeSignTool.

## Prerequisites

1. SSL.com Code Signing Certificate
2. CodeSignTool installed (typically in `~/bin/CodeSignTool` or set via environment variable)
3. Required environment variables set in `.env` file or your environment

## Environment Variables

The following environment variables are required for signing:

- `SSL_COM_USERNAME`: Your SSL.com account username/email
- `SSL_COM_PASSWORD`: Your SSL.com account password
- `SSL_COM_CREDENTIAL_ID`: The credential ID for your certificate
- `SSL_COM_TOTP_SECRET`: The TOTP secret for authentication (base32 encoded)
- `CODE_SIGN_TOOL_PATH` (optional): Path to the CodeSignTool directory (defaults to `~/bin/CodeSignTool`)

## Available Scripts

### 1. sign.js

Used by electron-builder during the build process to sign Windows executables. This is referenced in the `electron-builder.yml` configuration.

```
# This is called automatically by electron-builder
```

### 2. test-signing.js

Test the signing process without building the entire app:

```
node scripts/test-signing.js path/to/file.exe
```

## Important Notes

- Special characters in passwords are properly escaped in all scripts
- Each script creates a temporary copy of the file to sign and then copies it back to the original location
- Temporary scripts are created with appropriate permissions (mode 0o700 - rwx for user only)
- All scripts include error handling and cleanup of temporary files
- If the TOTP secret is provided in URI format (otpauth://totp/...), the script will extract just the secret part

## Known Issues

### TOTP Authentication

There is a known issue with the TOTP authentication where the SSL.com CodeSignTool may return an error message:

```
Error: The OTP is invalid
```

This can happen even when the TOTP secret is correctly configured. Several approaches have been tried:

1. Using the TOTP secret directly
2. Extracting the secret from a URI format
3. Generating a TOTP code from the secret

The issue might be related to:

- Time synchronization between your system and SSL.com's servers
- The TOTP secret format or encoding
- SSL.com's authentication requirements changing

### Possible Solutions

1. **Contact SSL.com Support**: If you're experiencing this issue, contact SSL.com support to verify your credentials and authentication setup.

2. **Manual Signing**: As a workaround, you can sign the files manually using the CodeSignTool directly:

   ```bash
   cd ~/bin/CodeSignTool
   ./CodeSignTool.sh sign -username="your-username" -password="your-password" -credential_id="your-credential-id" -totp_secret="your-totp-secret" -input_file_path="path/to/file.exe" -output_dir_path="output/dir" -override
   ```

3. **Investigate SSL.com's Documentation**: Check SSL.com's latest documentation for any changes to their authentication process or TOTP requirements.

## Troubleshooting

If you encounter issues with signing:

1. Check that all required environment variables are set correctly
2. Verify that the CodeSignTool is installed at the expected location
3. Ensure that your SSL.com credentials are valid
4. Check for special characters in your password which may cause issues
5. Make sure your TOTP secret is correct and properly formatted (base32 encoded)
6. Look for detailed error messages in the console output
7. Try signing with the latest version of SSL.com's CodeSignTool

## Testing

To test if the signing configuration is working correctly, you can use the test-signing.js script:

```
node scripts/test-signing.js path/to/some/test.exe
```

This will attempt to sign the file and provide detailed output about the process.
