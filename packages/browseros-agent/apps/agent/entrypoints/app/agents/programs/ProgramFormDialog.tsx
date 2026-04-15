import type {
  BrowserOSAgentProgram,
  BrowserOSProgramSchedule,
  BrowserOSStandingOrder,
  CreateAgentProgramInput,
  UpdateAgentProgramInput,
} from '@browseros/shared/types/role-programs'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type ProgramScheduleType = BrowserOSProgramSchedule['type']

interface ProgramDraft {
  name: string
  description: string
  prompt: string
  enabled: boolean
  scheduleType: ProgramScheduleType
  scheduleTime: string
  scheduleInterval: number
  standingOrders: BrowserOSStandingOrder[]
}

interface ProgramFormDialogProps {
  open: boolean
  program: BrowserOSAgentProgram | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (
    input: CreateAgentProgramInput | UpdateAgentProgramInput,
  ) => Promise<void>
}

function createEmptyStandingOrder(): BrowserOSStandingOrder {
  return {
    id: crypto.randomUUID(),
    title: '',
    instruction: '',
    enabled: true,
  }
}

function toDraft(program: BrowserOSAgentProgram | null): ProgramDraft {
  if (!program) {
    return {
      name: '',
      description: '',
      prompt: '',
      enabled: true,
      scheduleType: 'manual',
      scheduleTime: '09:00',
      scheduleInterval: 1,
      standingOrders: [],
    }
  }

  return {
    name: program.name,
    description: program.description,
    prompt: program.prompt,
    enabled: program.enabled,
    scheduleType: program.schedule.type,
    scheduleTime:
      program.schedule.type === 'daily' ? program.schedule.time : '09:00',
    scheduleInterval:
      program.schedule.type === 'hourly' || program.schedule.type === 'minutes'
        ? program.schedule.interval
        : 1,
    standingOrders: program.standingOrders,
  }
}

function toSchedule(draft: ProgramDraft): BrowserOSProgramSchedule {
  switch (draft.scheduleType) {
    case 'daily':
      return {
        type: 'daily',
        time: draft.scheduleTime,
      }
    case 'hourly':
      return {
        type: 'hourly',
        interval: draft.scheduleInterval,
      }
    case 'minutes':
      return {
        type: 'minutes',
        interval: draft.scheduleInterval,
      }
    case 'manual':
    default:
      return { type: 'manual' }
  }
}

export function ProgramFormDialog({
  open,
  program,
  saving,
  onOpenChange,
  onSave,
}: ProgramFormDialogProps) {
  const [draft, setDraft] = useState<ProgramDraft>(() => toDraft(program))

  useEffect(() => {
    if (!open) return
    setDraft(toDraft(program))
  }, [open, program])

  const isEditing = !!program

  const canSave = useMemo(() => {
    return (
      draft.name.trim() !== '' &&
      draft.description.trim() !== '' &&
      draft.prompt.trim() !== ''
    )
  }, [draft])

  const handleSave = async () => {
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      prompt: draft.prompt.trim(),
      schedule: toSchedule(draft),
      enabled: draft.enabled,
      standingOrders: draft.standingOrders
        .filter(
          (order) =>
            order.title.trim() !== '' || order.instruction.trim() !== '',
        )
        .map((order) => ({
          ...order,
          title: order.title.trim(),
          instruction: order.instruction.trim(),
        })),
    }

    await onSave(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Program' : 'Create Program'}
          </DialogTitle>
          <DialogDescription>
            Define a reusable responsibility for this agent. Automatic schedule
            execution lands in the next milestone, but you can save and run it
            manually now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="program-name">
              Program Name
            </label>
            <Input
              id="program-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Morning Brief"
            />
          </div>

          <div className="space-y-2">
            <label
              className="font-medium text-sm"
              htmlFor="program-description"
            >
              Description
            </label>
            <Input
              id="program-description"
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Prepare the executive morning brief."
            />
          </div>

          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="program-prompt">
              Prompt
            </label>
            <Textarea
              id="program-prompt"
              rows={6}
              value={draft.prompt}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  prompt: event.target.value,
                }))
              }
              placeholder="Review email, Slack, calendar, Linear, and Notion for urgent updates..."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor="program-schedule">
                Schedule
              </label>
              <Select
                value={draft.scheduleType}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    scheduleType: value as ProgramScheduleType,
                  }))
                }
              >
                <SelectTrigger id="program-schedule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual only</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="minutes">Every N minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draft.scheduleType === 'daily' && (
              <div className="space-y-2">
                <label className="font-medium text-sm" htmlFor="program-time">
                  Time
                </label>
                <Input
                  id="program-time"
                  type="time"
                  value={draft.scheduleTime}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scheduleTime: event.target.value,
                    }))
                  }
                />
              </div>
            )}

            {(draft.scheduleType === 'hourly' ||
              draft.scheduleType === 'minutes') && (
              <div className="space-y-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="program-interval"
                >
                  Interval
                </label>
                <Input
                  id="program-interval"
                  type="number"
                  min={1}
                  value={draft.scheduleInterval}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scheduleInterval: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    }))
                  }
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">Enabled</div>
              <p className="text-muted-foreground text-xs">
                Save this program as active for future scheduling.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, enabled: checked }))
              }
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Standing Orders</div>
                <p className="text-muted-foreground text-xs">
                  Persistent instructions that should always guide this program.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    standingOrders: [
                      ...current.standingOrders,
                      createEmptyStandingOrder(),
                    ],
                  }))
                }
              >
                <Plus className="mr-2 size-4" />
                Add Order
              </Button>
            </div>

            {draft.standingOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                No standing orders yet.
              </div>
            ) : (
              <div className="space-y-3">
                {draft.standingOrders.map((order) => (
                  <div
                    key={order.id}
                    className="space-y-3 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={order.title}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            standingOrders: current.standingOrders.map(
                              (item) =>
                                item.id === order.id
                                  ? { ...item, title: event.target.value }
                                  : item,
                            ),
                          }))
                        }
                        placeholder="Keep it concise"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            standingOrders: current.standingOrders.filter(
                              (item) => item.id !== order.id,
                            ),
                          }))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Textarea
                      rows={3}
                      value={order.instruction}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          standingOrders: current.standingOrders.map((item) =>
                            item.id === order.id
                              ? { ...item, instruction: event.target.value }
                              : item,
                          ),
                        }))
                      }
                      placeholder="Keep the output concise and action-oriented."
                    />
                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                      <span className="text-sm">Enabled</span>
                      <Switch
                        checked={order.enabled}
                        onCheckedChange={(checked) =>
                          setDraft((current) => ({
                            ...current,
                            standingOrders: current.standingOrders.map(
                              (item) =>
                                item.id === order.id
                                  ? { ...item, enabled: checked }
                                  : item,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
          >
            {saving
              ? 'Saving...'
              : isEditing
                ? 'Save Changes'
                : 'Create Program'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
