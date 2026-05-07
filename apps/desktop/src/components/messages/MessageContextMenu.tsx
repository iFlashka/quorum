/**
 * Discord-style context menu при правом клике на сообщении.
 * Появляется в точке клика (Position.x, Position.y), портал в body,
 * закрывается на click-outside / Esc / выбор пункта.
 *
 * Набор пунктов адаптирован под наш функционал:
 *   - Добавить реакцию (только если !disableActions)
 *   - Редактировать (свои + !disableActions)
 *   - Ответить
 *   - Скопировать текст
 *   - Скопировать ссылку на сообщение
 *   - Удалить сообщение (свои + !disableActions, red)
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  CornerUpLeft,
  Link2,
  Pencil,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface MessageContextMenuActions {
  isMine: boolean;
  disableActions: boolean;
  onReact?: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onCopy: () => void;
  onCopyLink: () => void;
  onDelete?: () => void;
}

interface MessageContextMenuProps extends MessageContextMenuActions {
  position: ContextMenuPosition;
  onClose: () => void;
}

const MENU_W = 240;
const MENU_H_EST = 280;

export function MessageContextMenu(props: MessageContextMenuProps): JSX.Element {
  const { position, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<ContextMenuPosition | null>(null);

  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + MENU_W > vw - 8) x = vw - MENU_W - 8;
    if (y + MENU_H_EST > vh - 8) y = vh - MENU_H_EST - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    setPos({ x, y });
  }, [position]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    const onContext = (e: MouseEvent): void => {
      // Если правый клик произошёл вне menu — закрываем (откроется новый).
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onEsc);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [onClose]);

  if (!pos) return <></>;

  const handle = (fn: (() => void) | undefined): (() => void) => {
    return () => {
      fn?.();
      onClose();
    };
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={
        {
          top: pos.y,
          left: pos.x,
          width: MENU_W,
          '--popover-origin': 'top left',
        } as React.CSSProperties
      }
      className="animate-popover-pop-in fixed z-[80] overflow-hidden rounded-md bg-bg-elevated py-1 shadow-elevated"
    >
      {!props.disableActions && props.onReact && (
        <>
          <Item icon={<SmilePlus size={16} strokeWidth={1.75} />} onClick={handle(props.onReact)}>
            Добавить реакцию
          </Item>
          <Divider />
        </>
      )}
      {props.isMine && !props.disableActions && props.onEdit && (
        <Item icon={<Pencil size={16} strokeWidth={1.75} />} onClick={handle(props.onEdit)}>
          Редактировать
        </Item>
      )}
      <Item icon={<CornerUpLeft size={16} strokeWidth={1.75} />} onClick={handle(props.onReply)}>
        Ответить
      </Item>
      <Divider />
      <Item icon={<Copy size={16} strokeWidth={1.75} />} onClick={handle(props.onCopy)}>
        Скопировать текст
      </Item>
      <Item icon={<Link2 size={16} strokeWidth={1.75} />} onClick={handle(props.onCopyLink)}>
        Скопировать ссылку на сообщение
      </Item>
      {props.isMine && !props.disableActions && props.onDelete && (
        <>
          <Divider />
          <Item
            icon={<Trash2 size={16} strokeWidth={1.75} />}
            onClick={handle(props.onDelete)}
            danger
          >
            Удалить сообщение
          </Item>
        </>
      )}
    </div>,
    document.body,
  );
}

interface ItemProps {
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}

function Item({ icon, onClick, danger, children }: ItemProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-2 py-1.5 text-left text-[14px] transition-colors',
        danger
          ? 'text-accent-danger hover:bg-accent-danger hover:text-white'
          : 'text-text-secondary hover:bg-accent-primary hover:text-white',
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

function Divider(): JSX.Element {
  return <div className="my-1 h-px bg-text-muted/15" />;
}
