export const port = 1234;
export const getPort = jest.fn().mockName("getPort").mockResolvedValue(1234);
export default getPort;
