import { useState } from "react";
import { FormProvider, useWatch, type FieldErrors } from "react-hook-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { AdvancedSettings } from "@/components/disclosure/AdvancedSettings";
import { Button } from "@/components/ui/button";
import { useNetworkMutations } from "@/features/networks/hooks/useNetworkDetail";
import type { Network } from "@/lib/types";
import type { NetworkFormData } from "../networkFormSchema";
import { AdvancedFields } from "./AdvancedFields";
import { advancedSummary } from "./advancedSummary";
import { EssentialFields } from "./EssentialFields";
import { useNetworkFormState } from "./useNetworkForm";

/** Fields rendered above the advanced disclosure. */
const ESSENTIAL_FIELDS = new Set<string>([
  "name",
  "cidr",
  "scanner_id",
  "port_preset",
  "port_spec",
  "schedule_mode",
  "schedule_time",
  "schedule_day",
  "nuclei_enabled",
]);

type NetworkFormPageProps =
  | { mode: "create"; cloneSource?: Network }
  | { mode: "edit"; network: Network };

/**
 * One-page network form for create, clone and edit (ADR 0011): six
 * essential fields, everything else behind "Show advanced settings".
 */
export function NetworkFormPage(props: NetworkFormPageProps) {
  const source = props.mode === "edit" ? props.network : props.cloneSource;
  const navigate = useNavigate();
  const { create, update } = useNetworkMutations();
  const state = useNetworkFormState(source, {
    cloneName: props.mode === "create",
  });
  const { form } = state;
  const [advancedOpen, setAdvancedOpen] = useState(
    () => form.getValues("schedule_mode") === "custom",
  );
  const values = useWatch({ control: form.control }) as NetworkFormData;

  const goBack = () =>
    props.mode === "edit"
      ? navigate({
          to: "/networks/$networkId",
          params: { networkId: String(props.network.id) },
          search: { tab: "settings" },
        })
      : navigate({ to: "/networks" });

  const onSubmit = (data: NetworkFormData) => {
    const payload = state.buildPayload(data) as Partial<Network>;
    if (props.mode === "edit") {
      update.mutate(
        { id: props.network.id, ...payload },
        {
          onSuccess: () => {
            toast.success("Network saved");
            void goBack();
          },
          onError: (e) => toast.error(e.message),
        },
      );
      return;
    }
    create.mutate(payload, {
      onSuccess: (created) => {
        toast.success("Network created");
        void navigate({
          to: "/networks/$networkId",
          params: { networkId: String(created.id) },
        });
      },
      onError: (e) => toast.error(e.message),
    });
  };

  // A rejected advanced field would be invisible while the section is closed.
  const onInvalid = (errors: FieldErrors<NetworkFormData>) => {
    if (Object.keys(errors).some((key) => !ESSENTIAL_FIELDS.has(key))) {
      setAdvancedOpen(true);
    }
  };

  const pending = create.isPending || update.isPending;
  const title =
    props.mode === "edit"
      ? `Edit ${props.network.name}`
      : props.cloneSource
        ? `Clone ${props.cloneSource.name}`
        : "Add network";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to={props.mode === "edit" ? "/networks/$networkId" : "/networks"}
          params={
            props.mode === "edit"
              ? { networkId: String(props.network.id) }
              : undefined
          }
          aria-label="Back"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-strong text-foreground">{title}</h1>
      </div>

      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          className="space-y-6"
          noValidate
        >
          <EssentialFields
            gvmPortList={state.isGreenbone ? state.gvmPortList : ""}
            onCustomSchedule={() => setAdvancedOpen(true)}
          />

          <AdvancedSettings
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            summary={advancedSummary(values)}
          >
            <AdvancedFields
              phases={state.phases}
              onPhasesChange={state.setPhases}
              gvmScanConfig={state.gvmScanConfig}
              onGvmScanConfigChange={state.setGvmScanConfig}
              gvmPortList={state.gvmPortList}
              onGvmPortListChange={state.setGvmPortList}
            />
          </AdvancedSettings>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => void goBack()}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : props.mode === "edit"
                  ? "Save"
                  : "Create network"}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
