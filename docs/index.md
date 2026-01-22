# Install and use Google Cloud IAP on macOS

Google IAP Desktop is Windows-only. macOS users lack an official client. This project fills that gap by providing a native macOS application for establishing SSH and RDP connections over Google Cloud IAP without Windows.

## What this tool does

This application provides a thin UI wrapper around `gcloud` for creating IAP tunnels. It is not a replacement for CLI tools or automation scripts. The focus is on interactive SSH and RDP sessions where you need to select VMs, manage multiple tunnels, and connect quickly without repeated command-line operations.

The app automatically finds free local ports, manages tunnel lifecycle, and integrates with Microsoft Remote Desktop on macOS for RDP connections.

## Prerequisites

Before installing, ensure you have:

- macOS 11.0 (Big Sur) or later
- Google Cloud CLI (`gcloud`) installed and configured
- IAM role: `roles/iap.tunnelResourceAccessor` (IAP-Secured Tunnel User)
- IAP TCP forwarding enabled in your Google Cloud project

For detailed IAP TCP forwarding setup, see the [official Google Cloud documentation](https://cloud.google.com/iap/docs/tcp-forwarding-overview).

## Installation

1. Download the latest release from [GitHub Releases](https://github.com/kvysotskyi/go-iap-mac/releases)
2. Extract the ZIP archive
3. Move `IAP Tunnel Manager.app` to `/Applications`
4. Launch the application

On first launch, macOS Gatekeeper will block the application because it is not code-signed with an Apple Developer certificate. To allow the app:

1. Open System Settings → Privacy & Security
2. Scroll to the Security section
3. Click "Open Anyway" next to the blocked application message
4. Confirm by clicking "Open" in the dialog

This is a one-time step. The app will launch normally on subsequent runs.

![macOS Gatekeeper security warning for IAP Tunnel Manager on macOS](docs/screenshots/allowinsecurity.png)

## First launch & authentication

The application uses your existing `gcloud` configuration. No credentials are stored by the app itself.

Before first use, ensure you have authenticated with Google Cloud:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login
```

The app reads Application Default Credentials (ADC) from `gcloud`. If authentication fails, the app will display an error message. Run the commands above and restart the application.

## UI walkthrough

### Project selection

The main window displays all Google Cloud projects accessible to your account. Use the search box to filter projects by name or ID.

![IAP Tunnel Manager main window showing project selection and VM list on macOS](docs/screenshots/mainWindow.png)

### VM list

After selecting a project, the app lists all Compute Engine VM instances across all zones. The list shows VM name, zone, status, and machine type. Windows VMs are automatically detected.

![IAP Tunnel Manager configuration window showing VM list and connection options](docs/screenshots/mainConfig.png)

### RDP / SSH selection

For each VM, you can choose the connection type:
- **RDP** (port 3389) for Windows VMs
- **SSH** (port 22) for Linux VMs
- Custom ports as needed

### RDP password generation

For Windows VMs, the app can generate and reset Windows passwords using the Compute Engine guest agent. Passwords can be saved to macOS Keychain for secure storage.

![IAP Tunnel Manager creating Windows App bookmark with RDP connection](docs/screenshots/createWindowsAppBookmark.png)

![IAP Tunnel Manager bookmark creation window with password generation options](docs/screenshots/Bookmarkcreatewindow.png)

## SSH workflow

1. Select a project and VM from the list
2. Choose SSH as the connection type
3. Click "Start Tunnel"
4. The app automatically finds a free local port and creates the IAP tunnel
5. Connect using `ssh -p LOCAL_PORT user@localhost`

No manual port management is required. The app handles tunnel creation, monitoring, and cleanup automatically.

## RDP workflow

The RDP workflow is the key differentiator from using `gcloud iap tunnel` manually:

1. Select a project and Windows VM
2. Choose RDP as the connection type
3. Click "Start Tunnel" to create the IAP connection
4. Use one of these options:
   - **Open Windows App**: Launches Microsoft Remote Desktop with the connection pre-configured
   - **Create Windows App Bookmark**: Creates a persistent bookmark in Microsoft Remote Desktop with credentials
   - **Copy Address**: Copies `localhost:PORT` for use with any RDP client

![IAP Tunnel Manager opening Windows App with RDP connection on macOS](docs/screenshots/openwindowsapp.png)

### Windows password generation

For Windows VMs, the app can:
- Generate new Windows passwords via the Compute Engine guest agent
- Store passwords securely in macOS Keychain
- Create Microsoft Remote Desktop bookmarks with credentials pre-filled

![IAP Tunnel Manager showing successful bookmark creation with saved credentials](docs/screenshots/bookmarkwindowsuccess.png)

### Bookmark creation in Microsoft Remote Desktop

The app integrates with Microsoft Remote Desktop (Windows App) on macOS:
- Automatically creates bookmarks in the Windows App
- Configures connection settings (host, port, credentials)
- Stores passwords in macOS Keychain
- Enables one-click connection from the Windows App

![Microsoft Remote Desktop showing ready-to-use IAP tunnel bookmark on macOS](docs/screenshots/readytousebookmark%20rdp%20windows.png)

## Why not just use gcloud iap tunnel?

The `gcloud compute start-iap-tunnel` command works well for automation and scripting. However, for daily interactive use, it has limitations:

**CLI advantages:**
- Scriptable and automatable
- No GUI dependencies
- Works in CI/CD pipelines

**CLI disadvantages:**
- Manual port selection and management
- Repeated command entry for each connection
- No integrated VM discovery
- No bookmark management for RDP clients

**This app is positioned for:**
- Daily interactive SSH/RDP sessions
- Managing multiple tunnels simultaneously
- Quick VM discovery across projects
- Integrated RDP bookmark creation

The CLI remains the better choice for automation. This app targets interactive use cases.

## Security model

The application uses Google Cloud authentication and IAM:

- **Authentication**: Uses `gcloud auth application-default login` credentials
- **Authorization**: Enforced by IAM roles (`roles/iap.tunnelResourceAccessor`)
- **Credential storage**: No credentials stored by the app; uses gcloud ADC
- **Tunnel security**: All connections go through Google IAP, which enforces zero-trust access policies

The app does not store, cache, or transmit credentials. All authentication flows through Google Cloud's official APIs.

## Limitations

This application has the following limitations:

- **macOS only**: No Windows or Linux versions available
- **Requires gcloud**: The Google Cloud CLI must be installed and configured
- **Not officially supported**: This is a community project, not supported by Google
- **App not code-signed**: The application is not signed with an Apple Developer certificate, requiring manual Gatekeeper approval on first launch

## FAQ

### Is there an official IAP Desktop for macOS?

No. Google IAP Desktop is Windows-only. There is no official macOS client from Google.

### Is this an IAP Desktop alternative?

Yes. This application provides similar functionality to IAP Desktop but for macOS, focusing on interactive SSH and RDP sessions over IAP tunnels.

### Does Google support this?

No. This is a community-maintained project and is not officially supported by Google.

### Does it replace gcloud?

No. This app is a UI wrapper around `gcloud` for interactive use. For automation and scripting, continue using `gcloud compute start-iap-tunnel` directly.

### Can I use this for SSH over IAP on macOS?

Yes. The app supports both SSH and RDP connections over IAP tunnels on macOS.

### How do I connect via gcloud iap tunnel on macOS?

You can use `gcloud compute start-iap-tunnel` directly, or use this application for a GUI-based workflow.

## Links

- [GitHub repository](https://github.com/kvysotskyi/go-iap-mac)
- [Releases](https://github.com/kvysotskyi/go-iap-mac/releases)
- [README FAQ](../README.md)
