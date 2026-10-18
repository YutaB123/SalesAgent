import type {TrackedCustomer} from '../types/salesAgent';
export type CustomerGroup = 'active'|'history';
export function customerGroup(c:TrackedCustomer):CustomerGroup {
 if(c.doNotContact)return 'history';
 if(c.trackingGroup)return c.trackingGroup;
 return c.followUpPending||c.followUpDate||c.followUpTasks?.some(t=>!t.completed)?'active':'history';
}
