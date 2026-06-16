# Privacy

ClipShelf handles clipboard data, screenshots, browser URLs, and local Obsidian notes. Treat the app as a local personal tool, not as a cloud service.

## What The App Stores

The app can store:

- copied text and links
- copied images
- source app names
- active-window titles
- browser URLs when macOS Automation permission allows them
- screenshots or window thumbnails when Screen Recording permission allows them
- saved Obsidian project/category metadata

Unsaved local history is retained for 7 days by default. Saved Obsidian notes remain in your vault until you delete them.

## Where Data Lives

Local clipboard history and generated assets are stored in Electron's user data directory for the app on your Mac.

Obsidian notes and attachments are written into your configured local vault, under the `复制素材库` folder.

## What The App Does Not Do

- It does not send clipboard content to a server.
- It does not include analytics.
- It does not create accounts.
- It does not sync data across devices.
- It does not use AI classification in the current MVP.

## Permissions

macOS may request permissions for:

- Screen Recording, used for source thumbnails.
- Automation, used for reading the active browser URL.

If these permissions are denied, clipboard capture still works with reduced context.

## Reporting Issues

When reporting bugs, do not attach raw clipboard history, private screenshots, personal URLs, or Obsidian notes unless you have sanitized them first.
