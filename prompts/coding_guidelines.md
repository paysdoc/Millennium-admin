### Programming guidelines
- **Code Clarity**: Write clear and maintainable code. Use meaningful variable names, comments, and documentation to explain complex logic.
- **Modular Design**: Structure the code in a modular way to promote reusability and separation of concerns. Each module should have a single responsibility.
- **File Size**: Keep file sizes manageable. If a file grows too large (greater than 150 lines), consider breaking it down into smaller, more focused modules.
- **Consistent Style**: Follow a consistent coding style throughout the project. Use a linter to enforce style rules and catch potential errors.
- **Version Control**: Use version control (e.g., Git) to track changes and collaborate effectively. Commit changes frequently with clear messages.
- **Testing**: Write unit tests for all components and features. Ensure that tests cover edge cases and potential failure points. Make use of mocking and stubbing where necessary to isolate tests.
- **Error Handling**: Implement robust error handling to gracefully manage unexpected situations. Use try-catch blocks where appropriate and provide meaningful error messages.
- **Performance Optimization**: Optimize code for performance, especially in critical areas like rendering and data processing. Use profiling tools to identify bottlenecks.
- **Security Practices**: Follow security best practices, such as input validation, secure authentication, and data encryption. Regularly review code for potential vulnerabilities.
- **Documentation**: Maintain comprehensive documentation for the codebase, including API documentation, architecture diagrams, and setup instructions. Use tools like JSDoc or Sphinx for generating documentation from comments.
- **Continuous Integration**: Set up a continuous integration (CI) pipeline to automate testing and ensure code quality. Use tools like Jenkins, Travis CI, or GitHub Actions to implement CI.  

*** Typescript Guidelines ***
- **Type Annotations**: Use type annotations to define the types of variables, function parameters, and return values. This helps catch type-related errors early in the development process.
- **Interfaces and Types**: Use interfaces and type aliases to define complex types and data structures. This promotes code clarity and reusability.
- **Enums**: Use enums for defining a set of named constants. This improves code readability and helps avoid magic numbers or strings.
- **Generics**: Use generics to create reusable components and functions that can work with different types. This allows for type safety while maintaining flexibility.
- **Strict Mode**: Enable strict mode in TypeScript to catch potential issues early. This includes options like `noImplicitAny`, `strictNullChecks`, and `strictFunctionTypes`.
- **Avoid `any` Type**: Avoid using the `any` type as much as possible. Instead, use specific types or generics to ensure type safety.
- **Type Guards**: Use type guards to narrow down types in conditional statements. This helps TypeScript understand the specific type of a variable at runtime.
- **Readonly Properties**: Use `readonly` properties in interfaces and types to indicate that certain properties should not be modified. This helps maintain immutability where appropriate.
- **Function Overloading**: Use function overloading to define multiple signatures for a function that behaves differently based on the input types. This enhances code clarity and allows for more flexible function definitions.
- **Avoid Implicit Any**: Ensure that all variables and function parameters have explicit types defined. This helps prevent unintended type coercion and improves code reliability.
- **Use `unknown` Instead than `any`**: When you need a type that can be anything but still want to enforce type checking, use `unknown` instead of `any`. This forces you to perform type checks before using the value.
- **Avoid \! Non-null Assertion Operator**: Use the non-null assertion operator (\!) sparingly. Instead, handle potential null or undefined values explicitly using type guards or optional chaining.
- **Use `as const` for Immutable Values**: When defining constant values, use `as const` to create a readonly type. This ensures that the value cannot be modified and helps TypeScript infer the most specific type possible.
- **Avoid Using `Object` Type**: Avoid using the `Object` type as it does not provide any type safety. Instead, use specific types or interfaces to define the structure of objects.
- **Use `Record` for Key-Value Pairs**: Use the `Record<K, T>` utility type for defining objects with specific key-value pairs. This provides better type safety and clarity compared to using plain objects.
- **Use `Partial` for Optional Properties**: Use the `Partial<T>` utility type when you want to define a type with optional properties. This allows you to create objects that may not have all properties defined.

### Functional Programming Guidelines
- **Pure Functions**: Write pure functions that do not have side effects and always return the same output for the same input. This makes testing and reasoning about code easier.
- **Immutability**: Prefer immutability over mutability. Use immutable data structures or libraries like Immutable.js to ensure that data is not modified directly. This helps prevent unintended side effects and makes code easier to reason about.
- **Higher-Order Functions**: Use higher-order functions to create reusable and composable code. Functions that take other functions as arguments or return functions can help create more abstract and flexible code structures.
- **Function Composition**: Use function composition to build complex functionality from simpler functions. This promotes code reuse and makes it easier to understand the flow of data through the application.
- **Avoid Side Effects**: Minimize side effects in functions. If a function needs to perform side effects (like logging or modifying global state), consider separating those concerns from the core logic of the function.
- **Use Closures**: Leverage closures to encapsulate state and create private variables. This can help maintain state without exposing it to the global scope, promoting encapsulation and reducing potential conflicts.
- **Avoid Global State**: Minimize the use of global state. Instead, pass data explicitly through function parameters. This makes functions more predictable and easier to test.
- **Use Functional Libraries**: Consider using functional programming libraries like Ramda or Lodash/fp to leverage functional programming concepts and utilities. These libraries provide functions for common operations like mapping, filtering, and reducing collections in a functional style.
- **Avoid Mutating Data Structures**: When working with data structures, avoid mutating them directly. Instead, create new instances with the desired changes. This helps maintain immutability and prevents unintended side effects.
- **Use Recursion**: When appropriate, use recursion to solve problems instead of loops. This can lead to cleaner and more expressive code, especially for operations on recursive data structures like trees or graphs.
- **Currying**: Use currying to transform functions that take multiple arguments into a series of functions that each take a single argument. This can improve code readability and allow for partial application of functions.
- **Avoid Deep Nesting**: Avoid deep nesting of functions or data structures. This can make code harder to read and maintain. Instead, consider breaking down complex logic into smaller, more manageable functions.
- **Use Functional Patterns**: Make use of common functional programming patterns like map, filter, reduce, and flatMap. These patterns can help you write more concise and expressive code when working with collections or data transformations.
- **Avoid Side Effects in Map/Reduce**: When using map or reduce functions, ensure that the callback functions do not have side effects. They should only transform data and return new values without modifying external state.

### Hygene Practices
- **Code Hygiene**: Ensure that code is clean and well-organized. Remove unused variables, functions, and imports to keep the codebase tidy.
- **Formatting**: Ensure consistent formatting across the codebase. Use tools like Prettier or ESLint to automatically format code and enforce style rules.