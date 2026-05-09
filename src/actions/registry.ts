export type ActionContext = {
  acceptCurrent: () => void;
  next: () => void;
  prev: () => void;
  quit: () => void;
};

export type ActionFn = (ctx: ActionContext) => void;

export const ACTIONS: Record<string, ActionFn> = {
  "record.accept": (ctx) => ctx.acceptCurrent(),
  "record.next": (ctx) => ctx.next(),
  "record.prev": (ctx) => ctx.prev(),
  "app.quit": (ctx) => ctx.quit(),
};
