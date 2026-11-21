import type { useSketchLibrary } from "#/hooks/use-sketch-library.ts";
import s from "./style.module.css";

type Props = { library: ReturnType<typeof useSketchLibrary> };

export default function SketchLibrary({ library }: Props) {
  if (library.listError) {
    return (
      <p className={s.warning} role="alert">
        Could not read library: {library.listError}
      </p>
    );
  } else if (library.records === null) {
    return null;
  } else if (library.records.length === 0) {
    return <p>No saved sketches yet.</p>;
  }

  return (
    <ul className={s.list}>
      {library.records.map((record) => {
        const date =
          record.savedAt === undefined ? null : new Date(record.savedAt);
        return (
          <li className={s.row} key={record.id}>
            <div className={s.details}>
              <button
                type="button"
                className={s.name}
                aria-label={`Open ${record.name}`}
                disabled={library.saving}
                onClick={() => library.open(record.id)}
              >
                {record.name}
                {date && (
                  <time
                    className={s.timestamp}
                    dateTime={date.toISOString()}
                    title={date.toLocaleString()}
                  >
                    {date.toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                )}
              </button>
            </div>
            <div className={s.rowActions}>
              <button
                type="button"
                className={s.quiet}
                aria-label={`Rename ${record.name}`}
                disabled={library.saving}
                onClick={() => library.rename(record)}
              >
                Rename
              </button>
              <button
                type="button"
                className={s.quiet}
                aria-label={`Delete ${record.name}`}
                disabled={library.saving}
                onClick={() => library.deleteSketch(record)}
              >
                Delete
              </button>
              <button
                type="button"
                className={s.quiet}
                aria-label={`Export ${record.name}`}
                disabled={library.saving}
                onClick={() => library.exportRecord(record.id)}
              >
                Export
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
