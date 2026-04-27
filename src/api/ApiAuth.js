import ApiManager from "./ApiManager";

const ApiAuth = {
  LoginApi: (data) => ApiManager.post(`/user-cut-video/login`, data),
};

export default ApiAuth;
