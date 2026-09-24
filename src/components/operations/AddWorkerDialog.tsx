"use client";

import * as React from "react";
import { LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewWorkerForm } from "@/components/workers/NewWorkerForm";

/** "Add worker" without leaving the directory: the same form, in a dialog. Bank details feed the payout engine. */
export function AddWorkerDialog() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <LuPlus className="size-4" aria-hidden />
        Add worker
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add worker</DialogTitle>
            <DialogDescription>Departments decide who is recommended for a project; bank details go straight to the payout engine.</DialogDescription>
          </DialogHeader>
          {open ? <NewWorkerForm /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
