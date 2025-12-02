# Datamap CRUD Operations

The Soar extension now provides full CRUD (Create, Read, Update, Delete)
operations for the datamap through the UI, eliminating the need to manually edit
JSON files.

## Overview

All datamap operations are accessible via the **Soar Datamap** tree view in the
sidebar. The tree view displays the hierarchical structure of your datamap, and
you can manipulate it using context menu commands.

## Operations

### 1. **Create** - Add Attribute

Add a new attribute to any SOAR_ID vertex in the datamap.

**How to use:**

1. Right-click on a SOAR_ID node (root or any attribute with children)
2. Select **"Add Attribute"**
3. Enter the attribute name (e.g., `position`, `status`, `value`)
4. Select the attribute type:
   - **SOAR_ID** - Identifier that can have sub-attributes
   - **INTEGER** - Integer number
   - **FLOAT** - Floating point number
   - **STRING** - Text string
   - **ENUMERATION** - Predefined choices
5. If ENUMERATION, enter comma-separated choices (e.g., `success, failure, pending`)
6. Optionally add a comment describing the attribute

**Result:** The new attribute is added to the datamap and saved to the project file.

### 2. **Read** - View Datamap

The tree view automatically displays the datamap structure.

**Features:**

- Hierarchical view of all attributes
- Type icons for each vertex type
- Descriptions showing:
  - Number of sub-attributes for SOAR_ID
  - Enumeration choices
  - Type information
- Tooltips with detailed information

### 3. **Update** - Edit Attribute

Modify an existing attribute's properties.

**How to use:**

1. Right-click on any attribute (not the root)
2. Select **"Edit Attribute"**
3. Choose what to edit:
   - **Rename** - Change the attribute name
   - **Edit Comment** - Add or modify the comment
   - **Change Type** - Change the attribute type (⚠️ may delete sub-attributes)

**Rename:**

- Enter the new attribute name
- Validation ensures no duplicates and proper format

**Edit Comment:**

- Add or modify the descriptive comment
- Empty comments are removed

**Change Type:**

- Select the new type
- ⚠️ Warning: Changing from SOAR_ID will delete all sub-attributes
- For ENUMERATION, specify the choices

**Result:** The attribute is updated and the project file is saved.

### 4. **Delete** - Delete Attribute

Remove an attribute and all its descendants from the datamap.

**How to use:**

1. Right-click on any attribute (not the root)
2. Select **"Delete Attribute"**
3. Confirm the deletion

**⚠️ Warning:** This operation:

- Deletes the attribute
- Recursively deletes all sub-attributes
- Cannot be undone (except via version control)

**Result:** The attribute is removed and the project file is saved.

## Context Menu Availability

The context menu shows different options depending on the selected item:

| Context           | Available Commands                              |
| ----------------- | ----------------------------------------------- |
| Root node         | Add Attribute                                   |
| SOAR_ID attribute | Add Attribute, Edit Attribute, Delete Attribute |
| Other attributes  | Edit Attribute, Delete Attribute                |

## Validation

- **Attribute names** must start with a letter and contain only letters, numbers, hyphens, and underscores
- **Duplicate names** are prevented at the same level
- **Enumerations** must have at least one choice
- **Type changes** warn if sub-attributes will be deleted

## File Updates

All operations automatically:

1. Update the datamap structure in memory
2. Save the changes to the project file (.vsa.json)
3. Refresh the tree view
4. Show confirmation messages

## Best Practices

1. **Use descriptive names** - Make attribute names clear and consistent
2. **Add comments** - Document what each attribute represents
3. **Use ENUMERATION** for fixed sets of values
4. **Plan hierarchy** - Design your datamap structure before creating
5. **Version control** - Commit datamap changes with meaningful messages

## Example Workflow

### Creating a command structure

1. Right-click on `^output-link` → Add Attribute

   - Name: `command`
   - Type: SOAR_ID
   - Comment: "Commands sent to environment"

2. Right-click on `^command` → Add Attribute

   - Name: `type`
   - Type: ENUMERATION
   - Choices: `move, attack, defend`
   - Comment: "Type of command"

3. Right-click on `^command` → Add Attribute

   - Name: `status`
   - Type: ENUMERATION
   - Choices: `pending, executing, complete, failed`
   - Comment: "Command execution status"

4. Right-click on `^command` → Add Attribute
   - Name: `parameters`
   - Type: SOAR_ID
   - Comment: "Command-specific parameters"

## Keyboard Shortcuts

No default keyboard shortcuts are assigned, but you can add them in VS Code settings:

```json
{
  "key": "ctrl+alt+a",
  "command": "soar.addAttribute",
  "when": "focusedView == soarDatamap"
}
```

## Troubleshooting

**"No datamap loaded"**

- Ensure a .vsa.json project file exists in your workspace
- Use "Load Datamap" command from the tree view title

**Context menu not showing**

- Ensure you're right-clicking on a valid node
- Root node only supports "Add Attribute"

**Changes not saving**

- Check file permissions on the project file
- Ensure the project file isn't read-only

**Tree view not updating**

- Click the refresh button in the tree view title
- Or use "Refresh Datamap" command

## Integration with Other Features

- **Completions** automatically use the updated datamap structure
- **Validation** checks code against the modified datamap
- **Hover** shows information from the updated datamap
- **Tree view** reflects changes immediately

## Future Enhancements

Potential future features:

- Drag-and-drop to reorganize attributes
- Bulk import/export operations
- Undo/redo support
- Datamap visualization diagrams
- Import from existing Soar code
