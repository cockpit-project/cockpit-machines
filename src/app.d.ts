export interface Notification {
    text: string;
    detail: string;
    type?: string;
    resourceId?: string;
}

export const App: () => React.ReactNode;
export default App;
