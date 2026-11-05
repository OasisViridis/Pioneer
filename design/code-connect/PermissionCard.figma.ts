// url=https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=830-1593
import figma from 'figma';

const instance = figma.selectedInstance;
const operation = instance.getString('Operation');
const scope = instance.getString('Scope');
const recipient = instance.getString('Recipient');
const expiry = instance.getString('Expiry');
const state = instance.getEnum('State', {
  Awaiting: 'Awaiting',
  Denied: 'Denied',
  Expired: 'Expired',
  Approved: 'Approved',
});

export default {
  example: figma.code`
    <PermissionCard
      operation=${operation}
      scope=${scope}
      recipient=${recipient}
      expiry=${expiry}
      state=${state}
    />
  `,
  imports: ['import { PermissionCard } from "./PermissionCard";'],
  id: 'permission-card',
};
