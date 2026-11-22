"use client";

import * as React from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type Ctx = (opts?: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = React.createContext<Ctx>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({...})) …` */
export const useConfirm = () => React.useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = React.useCallback<Ctx>((opts = {}) => new Promise<boolean>((resolve) => setState({ opts, resolve })), []);

  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => close(false)}
        title={state?.opts.title ?? "Ishonchingiz komilmi?"}
        description={state?.opts.description}
        className="sm:max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              {state?.opts.cancelText ?? "Bekor qilish"}
            </Button>
            <Button variant={state?.opts.destructive ? "destructive" : "default"} onClick={() => close(true)}>
              {state?.opts.confirmText ?? "Tasdiqlash"}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}
