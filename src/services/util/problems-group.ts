export const groupProblemsByApiIdentifier = (problems: { apiIdentifier: string; message: string }[]): Record<string, string[]> => {
  const problemGroup: Record<string, string[]> = {};
  problems.forEach((problem) => {
    if (!(problem.apiIdentifier in problemGroup)) {
      problemGroup[problem.apiIdentifier] = [];
    }
    problemGroup[problem.apiIdentifier]?.push(problem.message);
  });

  return problemGroup;
};
