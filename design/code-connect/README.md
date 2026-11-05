# Code Connect

`PermissionCard.figma.ts` maps the Figma component set `830:1593` to the React
`PermissionCard` in `apps/desktop/src/renderer/components/PermissionCard.tsx`.

## Local check

Install the official CLI outside the repository so it does not become a runtime
dependency:

```powershell
npm install --prefix tmp/code-connect --no-save @figma/code-connect@latest
.\tmp\code-connect\node_modules\.bin\figma.cmd connect parse --config figma.config.json --exit-on-unreadable-files
```

The parser emits the template JSON and reads the `// url=` metadata. It does not
write to Figma.

## Publish

Official publication needs:

- a Figma token with Code Connect write and File content read;
- a Dev or Full seat on a plan that includes Code Connect (Professional,
  Organization, or Enterprise);
- explicit authorization to publish the mapping to the shared file.

The current Education/student account has not demonstrated that combination.
Do not record `officialCodeConnectPublished=true` until the publish command
returns the component URL and a readback confirms it. The local template and
parser result are preparation, not publication.
