/** Source of the current time; injected so expiry, lockout and trending logic is testable. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
