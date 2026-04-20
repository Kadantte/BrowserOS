import type { UIMessage } from 'ai'
import { Bot } from 'lucide-react'
import { type FC, Fragment, type ReactNode } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import type { ChatAction } from '@/lib/chat-actions/types'
import { cn } from '@/lib/utils'
import { AmbientUserTurn } from './ambient/AmbientUserTurn'
import { ChatMessageActions } from './ChatMessageActions'
import { ConnectAppCard } from './ConnectAppCard'
import { getMessageSegments } from './getMessageSegments'
import { JtbdPopup } from './JtbdPopup'
import { ScheduleSuggestionCard } from './ScheduleSuggestionCard'
import { ToolBatch } from './ToolBatch'
import { UserActionMessage } from './UserActionMessage'

type ChatMessagesVariant = 'default' | 'ambient'

interface ChatMessagesProps {
  messages: UIMessage[]
  status: 'streaming' | 'submitted' | 'ready' | 'error'
  getActionForMessage?: (message: UIMessage) => ChatAction | undefined
  liked: Record<string, boolean>
  onClickLike: (messageId: string) => void
  disliked: Record<string, boolean>
  onClickDislike: (messageId: string, comment?: string) => void
  showJtbdPopup: boolean
  showDontShowAgain: boolean
  onTakeSurvey: (opts?: { dontShowAgain?: boolean }) => void
  onDismissJtbdPopup: (dontShowAgain: boolean) => void
  onToolApprove?: (approvalId: string) => void
  onToolDeny?: (approvalId: string) => void
  variant?: ChatMessagesVariant
  header?: ReactNode
  emptyStateSlot?: ReactNode
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  messages,
  status,
  getActionForMessage,
  liked,
  disliked,
  onClickLike,
  onClickDislike,
  showJtbdPopup,
  showDontShowAgain,
  onTakeSurvey,
  onDismissJtbdPopup,
  onToolApprove,
  onToolDeny,
  variant = 'default',
  header,
  emptyStateSlot,
}) => {
  const isStreaming = status === 'streaming' || status === 'submitted'
  const ambient = variant === 'ambient'

  return (
    <>
      <Conversation className="ph-mask">
        <ConversationContent
          className={cn(
            ambient &&
              'mx-auto w-full max-w-[760px] gap-4 px-4 pt-10 pb-[160px] sm:px-8 sm:pt-[72px]',
          )}
        >
          {header}
          {ambient && messages.length === 0 && emptyStateSlot}
          {messages.map((message, messageIndex) => {
            const action = getActionForMessage?.(message)
            const isLastMessage = messageIndex === messages.length - 1
            const segments = getMessageSegments(
              message,
              isLastMessage,
              isStreaming,
            )
            const toolBatches = segments.filter((s) => s.type === 'tool-batch')
            const lastToolBatchKey = toolBatches[toolBatches.length - 1]?.key

            const messageText = segments
              ?.filter((each) => each.type === 'text')
              ?.map((each) => each.text)
              ?.join('\n\n')

            const likeAction = () => onClickLike(message.id)
            const dislikeAction = (comment?: string) =>
              onClickDislike(message.id, comment)

            if (ambient && message.role === 'user' && !action) {
              return (
                <AmbientUserTurn key={message.id}>
                  <div className="whitespace-pre-wrap">
                    {segments
                      .filter((s) => s.type === 'text')
                      .map((s) => s.text)
                      .join('\n\n')}
                  </div>
                </AmbientUserTurn>
              )
            }

            return (
              <Fragment key={message.id}>
                <Message
                  from={message.role}
                  className={cn(ambient && 'max-w-full')}
                >
                  <MessageContent
                    className={cn(
                      ambient &&
                        'group-[.is-assistant]:pl-0 sm:group-[.is-assistant]:pl-[42px]',
                    )}
                  >
                    {action ? (
                      <UserActionMessage action={action} />
                    ) : (
                      segments.map((segment) => {
                        switch (segment.type) {
                          case 'text':
                            return (
                              <div
                                key={segment.key}
                                className={cn(
                                  ambient &&
                                    'my-2 text-[14.5px] leading-[1.65]',
                                )}
                              >
                                <MessageResponse>
                                  {segment.text}
                                </MessageResponse>
                              </div>
                            )
                          case 'reasoning':
                            return (
                              <Reasoning
                                key={segment.key}
                                className={cn('w-full', ambient && 'my-3')}
                                isStreaming={segment.isStreaming}
                              >
                                <ReasoningTrigger />
                                <ReasoningContent>
                                  {segment.text}
                                </ReasoningContent>
                              </Reasoning>
                            )
                          case 'tool-batch':
                            return (
                              <ToolBatch
                                key={segment.key}
                                tools={segment.tools}
                                isLastBatch={segment.key === lastToolBatchKey}
                                isLastMessage={isLastMessage}
                                isStreaming={isStreaming}
                                onApprove={onToolApprove}
                                onDeny={onToolDeny}
                              />
                            )
                          case 'nudge':
                            return segment.nudgeType ===
                              'schedule_suggestion' ? (
                              <ScheduleSuggestionCard
                                key={segment.key}
                                data={segment.data}
                                isLastMessage={isLastMessage}
                              />
                            ) : (
                              <ConnectAppCard
                                key={segment.key}
                                data={segment.data}
                                isLastMessage={isLastMessage}
                              />
                            )
                          default:
                            return null
                        }
                      })
                    )}
                  </MessageContent>
                </Message>
                {message.role === 'assistant' &&
                (!isLastMessage || !isStreaming) ? (
                  <div className={cn(ambient && 'sm:pl-[42px]')}>
                    <ChatMessageActions
                      messageId={message.id}
                      messageText={messageText}
                      liked={liked[message.id] ?? false}
                      disliked={disliked[message.id] ?? false}
                      onClickLike={likeAction}
                      onClickDislike={dislikeAction}
                    />
                  </div>
                ) : null}
              </Fragment>
            )
          })}
          {showJtbdPopup && (
            <JtbdPopup
              onTakeSurvey={onTakeSurvey}
              onDismiss={onDismissJtbdPopup}
              showDontShowAgain={showDontShowAgain}
            />
          )}
          {ambient && <AmbientStreamingIndicator visible={isStreaming} />}
        </ConversationContent>
        <ConversationScrollButton offsetBottom={ambient ? 170 : undefined} />
      </Conversation>

      {!ambient && isStreaming && (
        <div className="flex animate-fadeInUp gap-2 px-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-1 rounded-xl rounded-tl-none border border-border/50 bg-card px-3 py-2.5 shadow-sm">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)] [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)] [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)]" />
          </div>
        </div>
      )}
    </>
  )
}

const AmbientStreamingIndicator: FC<{ visible: boolean }> = ({ visible }) => (
  <div className="mt-2 mb-1 flex min-h-[18px] items-center gap-2 text-[13px] text-muted-foreground sm:pl-[42px]">
    {visible && (
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)] [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)] [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)]" />
      </span>
    )}
  </div>
)
