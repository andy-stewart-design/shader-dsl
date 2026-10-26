import { EditorSelection, type StateCommand } from "@codemirror/state";

/** Insert an indented blank line above every selected line. */
export const insertLineAbove: StateCommand = ({ state, dispatch }) => {
	if (state.readOnly) return false;

	const lines = new Map<number, { indentation: string; primary: boolean }>();
	const mainIndex = state.selection.mainIndex;

	for (const [index, range] of state.selection.ranges.entries()) {
		const line = state.doc.lineAt(range.head);
		const indentation = line.text.match(/^[ \t]*/)?.[0] ?? "";
		const existing = lines.get(line.from);

		if (existing) {
			existing.primary ||= index === mainIndex;
		} else {
			lines.set(line.from, {
				indentation,
				primary: index === mainIndex,
			});
		}
	}

	const insertions = [...lines.entries()]
		.sort(([fromA], [fromB]) => fromA - fromB)
		.map(([from, { indentation, primary }]) => ({
			from,
			indentation,
			primary,
		}));
	const changes = insertions.map(({ from, indentation }) => ({
		from,
		insert: `${indentation}${state.lineBreak}`,
	}));
	const changeSet = state.changes(changes);
	const ranges = insertions.map(({ from, indentation }) =>
		EditorSelection.cursor(changeSet.mapPos(from, -1) + indentation.length),
	);
	const newMainIndex = insertions.findIndex(({ primary }) => primary);

	dispatch(
		state.update({
			changes: changeSet,
			selection: EditorSelection.create(ranges, newMainIndex),
			scrollIntoView: true,
			userEvent: "input",
		}),
	);
	return true;
};
