import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActor } from "./actor";
import { Label, Panel, useRefreshSnapshot } from "./primitives";
import { advanceWorkflowFn } from "@/lib/dms.functions";
import { WORKFLOW_TRANSITIONS, ROLE_PROFILE, type DocStatus } from "@/lib/dms-types";

interface WorkflowActionsProps {
  documentId: string;
  currentStatus: DocStatus;
}

export function WorkflowActions({ documentId, currentStatus }: WorkflowActionsProps) {
  const { actor } = useActor();
  const refresh = useRefreshSnapshot();
  const advance = useServerFn(advanceWorkflowFn);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const profile = ROLE_PROFILE[actor.role];
  const nextStatuses = WORKFLOW_TRANSITIONS[currentStatus] || [];

  if (nextStatuses.length === 0) {
    return null;
  }

  async function handleTransition(newStatus: DocStatus) {
    // Permission check for approvals
    const isApproval = newStatus === "APPROVED" || newStatus === "REJECTED";
    if (isApproval && !profile.canApprove) {
      toast.error(`Your role (${profile.label}) does not have approval rights.`);
      return;
    }

    setBusy(true);
    try {
      await advance({
        data: {
          actor,
          documentId,
          newStatus,
          comment: comment.trim(),
        },
      });
      toast.success(`Workflow status updated to ${newStatus.replace(/_/g, " ")}`);
      setComment("");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to update workflow");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-4 space-y-3">
      <Label>Document Workflow State Machine</Label>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Current state:</span>
        <span className="inline-flex items-center rounded-xs border border-transparent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase bg-secondary text-foreground">
          {currentStatus.replace(/_/g, " ")}
        </span>
      </div>

      <div className="space-y-3">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add comments / audit logs for this workflow transition..."
          className="w-full min-h-[60px] rounded-sm border border-border bg-background p-2 text-xs outline-none focus:border-primary"
        />

        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((status) => {
            const isApproval = status === "APPROVED" || status === "REJECTED";
            const isDisabled = busy || (isApproval && !profile.canApprove);
            
            let btnClass = "rounded-sm px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ";
            if (status === "APPROVED") {
              btnClass += "bg-seal text-seal-foreground hover:opacity-90";
            } else if (status === "REJECTED") {
              btnClass += "bg-destructive text-destructive-foreground hover:opacity-90";
            } else {
              btnClass += "bg-primary text-primary-foreground hover:opacity-90";
            }

            return (
              <button
                key={status}
                disabled={isDisabled}
                onClick={() => void handleTransition(status)}
                className={btnClass}
              >
                Transition to {status.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
