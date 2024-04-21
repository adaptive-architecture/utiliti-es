/**
 * SerializableValues is a type that represents common values that can be serialized as JSON in most languages.
 */
export type SerializableValues =
  | string
  | number
  | boolean
  | null
  | Date
  | Array<SerializableValues>
  | { [key: string]: SerializableValues };
