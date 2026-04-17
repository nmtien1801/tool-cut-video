import ApiManager from "./ApiManager";

const ApiAuth = {
  LoginApi: (data) => ApiManager.post(`/auth/login`, data),
};

export default ApiAuth;
