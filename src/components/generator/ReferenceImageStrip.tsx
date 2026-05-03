import { useMemo } from 'react';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImagePlus, X } from 'lucide-react';

type ReferenceImageStripProps = {
  images: string[];
  maxImages?: number;
  onAdd: () => void;
  onPreview: (image: string) => void;
  onRemove: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onChipClick?: (index: number) => void;
};

type SortableReferenceImage = {
  id: string;
  src: string;
  index: number;
};

export function ReferenceImageStrip({
  images,
  maxImages = 5,
  onAdd,
  onPreview,
  onRemove,
  onReorder,
  onChipClick,
}: ReferenceImageStripProps) {
  const sortableImages = useMemo<SortableReferenceImage[]>(() => {
    const seen = new Map<string, number>();

    return images.map((src, index) => {
      const occurrence = seen.get(src) ?? 0;
      seen.set(src, occurrence + 1);

      return {
        id: `${src}::${occurrence}`,
        src,
        index,
      };
    });
  }, [images]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const fromIndex = sortableImages.findIndex((image) => image.id === active.id);
    const toIndex = sortableImages.findIndex((image) => image.id === over.id);

    if (fromIndex === -1 || toIndex === -1) return;

    onReorder(fromIndex, toIndex);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={sortableImages.map((image) => image.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {sortableImages.map((image) => (
            <SortableThumbnail
              key={image.id}
              id={image.id}
              src={image.src}
              index={image.index}
              onPreview={() => onPreview(image.src)}
              onRemove={() => onRemove(image.index)}
              onChipClick={onChipClick ? () => onChipClick(image.index) : undefined}
            />
          ))}

          {images.length < maxImages && (
            <button
              type="button"
              onClick={onAdd}
              title="Upload image"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ms-chip-glass text-muted-foreground transition-all hover:text-foreground"
            >
              <ImagePlus className="h-5 w-5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}


type SortableThumbnailProps = {
  id: string;
  src: string;
  index: number;
  onPreview: () => void;
  onRemove: () => void;
  onChipClick?: () => void;
};

function SortableThumbnail({ id, src, index, onPreview, onRemove, onChipClick }: SortableThumbnailProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

   return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => (onChipClick ? onChipClick() : onPreview())}
      onDoubleClick={() => onPreview()}
      style={{ transform: CSS.Transform.toString(transform), transition, touchAction: 'none' }}
      className={`group relative h-16 w-16 shrink-0 cursor-grab rounded-2xl overflow-hidden border border-white/10 bg-muted/20 active:cursor-grabbing ${isDragging ? 'z-20 opacity-60 scale-105 shadow-xl' : ''}`}
    >
      <img src={src} alt="" className="pointer-events-none h-full w-full select-none object-cover" draggable={false} />
      <span className="pointer-events-none absolute bottom-1 left-1 flex h-4 min-w-4 px-1 items-center justify-center rounded bg-[#9C3FED] text-[10px] font-bold text-white">
        @{index + 1}
      </span>

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/90 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/90"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
