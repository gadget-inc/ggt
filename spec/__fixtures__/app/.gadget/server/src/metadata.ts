import type { ModelMetadata } from "./types";

/**
 * Internal variable to store model blobs with GraphQL typename as the key, and use them in the action code functions.
 * @internal
 */
export const modelsMap: Record<string, ModelMetadata> = {"User":{"key":"DataModel-jDYSRggNrhg_","name":"User","apiIdentifier":"user","fields":{"ModelField-_hWsy0Kq7Jt7-system-id":{"fieldType":"ID","key":"ModelField-_hWsy0Kq7Jt7-system-id","name":"ID","apiIdentifier":"id","configuration":{"type":"IDConfig","key":"IDConfig-38ksLSdqH_Ak","createdDate":1698332403774},"internalWritable":true},"ModelField--XZF-OSu9fXv-system-createdAt":{"fieldType":"DateTime","key":"ModelField--XZF-OSu9fXv-system-createdAt","name":"Created At","apiIdentifier":"createdAt","configuration":{"type":"DateTimeConfig","key":"DateTimeConfig-1L4zh78zjDV0","createdDate":1698332403774,"includeTime":true,"default":null},"internalWritable":true},"ModelField-1c6q3ef8obM--system-updatedAt":{"fieldType":"DateTime","key":"ModelField-1c6q3ef8obM--system-updatedAt","name":"Updated At","apiIdentifier":"updatedAt","configuration":{"type":"DateTimeConfig","key":"DateTimeConfig-v3UI8g14Gc3_","createdDate":1698332403774,"includeTime":true,"default":null},"internalWritable":true},"ModelField-4HDQXqy7qHs4":{"fieldType":"String","key":"ModelField-4HDQXqy7qHs4","name":"Field L","apiIdentifier":"resetPasswordToken","configuration":{"type":"StringConfig","key":"StringConfig-5-0RqdJvASkx","createdDate":1698332403826,"default":null},"internalWritable":true},"ModelField-8SRKQrCKtuTj":{"fieldType":"String","key":"ModelField-8SRKQrCKtuTj","name":"Field J","apiIdentifier":"emailVerificationToken","configuration":{"type":"StringConfig","key":"StringConfig-z6lIU_jAZQ3m","createdDate":1698332403824,"default":null},"internalWritable":true},"ModelField-A7Yyl_YQBFn8":{"fieldType":"Password","key":"ModelField-A7Yyl_YQBFn8","name":"Field I","apiIdentifier":"password","configuration":{"type":"PasswordConfig","key":"PasswordConfig-RGd8DwSMsIaj","createdDate":1698332403820},"internalWritable":true},"ModelField-E-mvcgMbyQeR":{"fieldType":"RoleAssignments","key":"ModelField-E-mvcgMbyQeR","name":"Field G","apiIdentifier":"roles","configuration":{"type":"RoleAssignmentsConfig","key":"RoleAssignmentsConfig-YK4qCX9wp7oK","createdDate":1698332403817,"default":["unauthenticated"]},"internalWritable":true},"ModelField-EpoGq3Yb0JTo":{"fieldType":"Email","key":"ModelField-EpoGq3Yb0JTo","name":"Field C","apiIdentifier":"email","configuration":{"type":"EmailConfig","key":"EmailConfig-UauWew4CyA4A","createdDate":1698332403809,"default":null},"internalWritable":true},"ModelField-Fy3eppTyYKaR":{"fieldType":"String","key":"ModelField-Fy3eppTyYKaR","name":"Field F","apiIdentifier":"googleProfileId","configuration":{"type":"StringConfig","key":"StringConfig-1WZQq5XEKsqP","createdDate":1698332403816,"default":null},"internalWritable":true},"ModelField-GnKVRxSxQ2GA":{"fieldType":"DateTime","key":"ModelField-GnKVRxSxQ2GA","name":"Field K","apiIdentifier":"emailVerificationTokenExpiration","configuration":{"type":"DateTimeConfig","key":"DateTimeConfig-44OPyiuJjHrE","createdDate":1698332403825,"includeTime":true,"default":null},"internalWritable":true},"ModelField-IcELQUVBg4yz":{"fieldType":"DateTime","key":"ModelField-IcELQUVBg4yz","name":"Field H","apiIdentifier":"lastSignedIn","configuration":{"type":"DateTimeConfig","key":"DateTimeConfig-ku8z2ZnppMJY","createdDate":1698332403818,"includeTime":true,"default":null},"internalWritable":true},"ModelField-NKijkFu-drbK":{"fieldType":"String","key":"ModelField-NKijkFu-drbK","name":"Field A","apiIdentifier":"firstName","configuration":{"type":"StringConfig","key":"StringConfig-ZCCQpgdpKfcB","createdDate":1698332403806,"default":null},"internalWritable":true},"ModelField-OrlZMoMod_m4":{"fieldType":"Boolean","key":"ModelField-OrlZMoMod_m4","name":"Field D","apiIdentifier":"emailVerified","configuration":{"type":"BooleanConfig","key":"BooleanConfig-s57fBAG3-nSJ","createdDate":1698332403813,"default":false},"internalWritable":true},"ModelField-QTkEPEE9R7I3":{"fieldType":"DateTime","key":"ModelField-QTkEPEE9R7I3","name":"Field M","apiIdentifier":"resetPasswordTokenExpiration","configuration":{"type":"DateTimeConfig","key":"DateTimeConfig-4JlBsgWv_qUM","createdDate":1698332403827,"includeTime":true,"default":null},"internalWritable":true},"ModelField-UNuTrWNgoehA":{"fieldType":"String","key":"ModelField-UNuTrWNgoehA","name":"Field B","apiIdentifier":"lastName","configuration":{"type":"StringConfig","key":"StringConfig-oWU5sid7o_bR","createdDate":1698332403808,"default":null},"internalWritable":true},"ModelField-pbsfdX7s-MzT":{"fieldType":"URL","key":"ModelField-pbsfdX7s-MzT","name":"Field E","apiIdentifier":"googleImageUrl","configuration":{"type":"URLConfig","key":"URLConfig-CgZH4dTwkUd3","createdDate":1698332403814,"default":null},"internalWritable":true}},"graphqlTypeName":"User","stateChart":{"childStates":[{"customApiIdentifier":null,"childStates":[],"type":"State","key":"qEhGEbSppe4Q","createdDate":1698332403786,"name":"Start","color":"#FCFCFC","isRecordBirthPlace":true,"isUndeleteableSystemState":true,"boxLayout":{"x":208,"y":32,"width":24,"height":24},"restoreHistory":true},{"customApiIdentifier":null,"childStates":[],"type":"State","key":"yr0j2AnSS7ve","createdDate":1698332403786,"name":"Created","color":"#3280D6","isRecordBirthPlace":false,"isUndeleteableSystemState":true,"boxLayout":{"x":64,"y":192,"width":448,"height":272},"restoreHistory":true},{"customApiIdentifier":null,"childStates":[],"type":"State","key":"8xEuJl1UV_V0","createdDate":1698332403786,"name":"Deleted","color":"#DF2222","isRecordBirthPlace":false,"isUndeleteableSystemState":false,"boxLayout":{"x":208,"y":592,"width":160,"height":48},"restoreHistory":true}],"initialChildState":"qEhGEbSppe4Q","type":"StateChart","key":"StateChart-L3G1jnQ_irWk","createdDate":1698332403786,"actions":{"IwXWpbWgikyR":{"type":"Action","key":"IwXWpbWgikyR","createdDate":1698332403786,"name":"Delete","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-MXW3aqdxYBh0","createdDate":1698332403786,"effects":{"_map":{"Effect-Kcjzx9iG0r6h":{"type":"Effect","key":"Effect-Kcjzx9iG0r6h","createdDate":1698332403796,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-n5OOY-OT7Ntr","createdDate":1698332403796,"values":{"sourceFilePath":"user/actions/delete.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-Kcjzx9iG0r6h","_tail":"Effect-Kcjzx9iG0r6h"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-zIDzKi9urNnR","createdDate":1698332403786,"effects":{"_map":{"Effect-nJgNVBK-5xy_":{"type":"Effect","key":"Effect-nJgNVBK-5xy_","createdDate":1698332403797,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-xm497xBrk4K5","createdDate":1698332403797,"values":{"sourceFilePath":"user/actions/delete.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-nJgNVBK-5xy_","_tail":"Effect-nJgNVBK-5xy_"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-M8McOdQl13vq","createdDate":1698332403786,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":false,"allowBulkInvocation":true,"sourceFilePath":"user/actions/delete.js","triggers":{"Trigger-TuC2yiuarJjY":{"type":"Trigger","key":"Trigger-TuC2yiuarJjY","createdDate":1698332403797,"specID":"gadget/trigger/graphql_api","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-IgBVWLgxIale","values":{}}}},"customApiIdentifier":null,"timeout":"3 minutes"},"S8WnqiL0dys3":{"type":"Action","key":"S8WnqiL0dys3","createdDate":1698332403786,"name":"Update","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-3Pp7Gr231TAg","createdDate":1698332403786,"effects":{"_map":{"Effect-mhMeJIWIGsBc":{"type":"Effect","key":"Effect-mhMeJIWIGsBc","createdDate":1698332403793,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-trmflCPUfdbB","createdDate":1698332403793,"values":{"sourceFilePath":"user/actions/update.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-mhMeJIWIGsBc","_tail":"Effect-mhMeJIWIGsBc"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-IHOKjsku7kgl","createdDate":1698332403786,"effects":{"_map":{"Effect-gtDkq46uKg49":{"type":"Effect","key":"Effect-gtDkq46uKg49","createdDate":1698332403794,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-ucavEEUpdzSz","createdDate":1698332403794,"values":{"sourceFilePath":"user/actions/update.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-gtDkq46uKg49","_tail":"Effect-gtDkq46uKg49"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-54KT0-AReHl8","createdDate":1698332403786,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":false,"allowBulkInvocation":true,"sourceFilePath":"user/actions/update.js","triggers":{"Trigger-lYL6x5OiiRaV":{"type":"Trigger","key":"Trigger-lYL6x5OiiRaV","createdDate":1698332403794,"specID":"gadget/trigger/graphql_api","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-98c2XHk8wH6s","values":{}}}},"customApiIdentifier":null,"timeout":"3 minutes"},"Action-4gpeQoE4fCbf":{"type":"Action","key":"Action-4gpeQoE4fCbf","createdDate":1698332403833,"name":"signUp","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-NSqBouzVvhEI","createdDate":1698332403833,"effects":{"_map":{"Effect-MmctJaZNy7cF":{"type":"Effect","key":"Effect-MmctJaZNy7cF","createdDate":1698332403841,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-kTUAIlIxzqR3","createdDate":1698332403840,"values":{"sourceFilePath":"user/actions/signUp.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-MmctJaZNy7cF","_tail":"Effect-MmctJaZNy7cF"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-Ohj0lpFHRfhZ","createdDate":1698332403833,"effects":{"_map":{"Effect-hTmbyEAfFnn1":{"type":"Effect","key":"Effect-hTmbyEAfFnn1","createdDate":1698332403842,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-ZS2F-wueVjBC","createdDate":1698332403842,"values":{"sourceFilePath":"user/actions/signUp.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-hTmbyEAfFnn1","_tail":"Effect-hTmbyEAfFnn1"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-Q-FPJemQK8wt","createdDate":1698332403833,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":true,"allowBulkInvocation":true,"sourceFilePath":"user/actions/signUp.js","triggers":{"Trigger-Vezej0TAox1i":{"type":"Trigger","key":"Trigger-Vezej0TAox1i","createdDate":1698332403836,"specID":"gadget/trigger/auth/signup","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-JR7X7wsu1Uz5","values":{}}},"Trigger-yzf-cAZvKIzz":{"type":"Trigger","key":"Trigger-yzf-cAZvKIzz","createdDate":1698332403835,"specID":"gadget/trigger/google_oauth/signup","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-eHP3ulKGN-FO","values":{}}}},"customApiIdentifier":"signUp","timeout":"3 minutes"},"Action-670SuQ__Vzfz":{"type":"Action","key":"Action-670SuQ__Vzfz","createdDate":1698332403878,"name":"resetPassword","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-v7gIK8DtG3mQ","createdDate":1698332403878,"effects":{"_map":{"Effect-_6kp2d8ey_nQ":{"type":"Effect","key":"Effect-_6kp2d8ey_nQ","createdDate":1698332403884,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-vymyKVyHBrxc","createdDate":1698332403884,"values":{"sourceFilePath":"user/actions/resetPassword.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-_6kp2d8ey_nQ","_tail":"Effect-_6kp2d8ey_nQ"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-kUxSCD8sxOwG","createdDate":1698332403878,"effects":{"_map":{"Effect-Zsx-RoyqfQIm":{"type":"Effect","key":"Effect-Zsx-RoyqfQIm","createdDate":1698332403886,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-LAE5xHRnV-FE","createdDate":1698332403886,"values":{"sourceFilePath":"user/actions/resetPassword.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-Zsx-RoyqfQIm","_tail":"Effect-Zsx-RoyqfQIm"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-LiBft-gh9zNY","createdDate":1698332403878,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":true,"allowBulkInvocation":true,"sourceFilePath":"user/actions/resetPassword.js","triggers":{"Trigger-MBcC_Vm6r6pl":{"type":"Trigger","key":"Trigger-MBcC_Vm6r6pl","createdDate":1698332403879,"specID":"gadget/trigger/auth/reset-password","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-VqmWii-ccHwU","values":{}}}},"customApiIdentifier":"resetPassword","timeout":"3 minutes"},"Action-HLQ_yGMw5kit":{"type":"Action","key":"Action-HLQ_yGMw5kit","createdDate":1698332403844,"name":"signIn","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-3vUOZE4dx5Zu","createdDate":1698332403844,"effects":{"_map":{"Effect-ZqjyKd5iaKyg":{"type":"Effect","key":"Effect-ZqjyKd5iaKyg","createdDate":1698332403849,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-dkPMsy7odO_J","createdDate":1698332403849,"values":{"sourceFilePath":"user/actions/signIn.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-ZqjyKd5iaKyg","_tail":"Effect-ZqjyKd5iaKyg"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-hq-FtiWfpE-v","createdDate":1698332403845,"effects":{"_map":{"Effect-eh7TwV-WIpxd":{"type":"Effect","key":"Effect-eh7TwV-WIpxd","createdDate":1698332403850,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-LEUTFTg0VGrv","createdDate":1698332403850,"values":{"sourceFilePath":"user/actions/signIn.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-eh7TwV-WIpxd","_tail":"Effect-eh7TwV-WIpxd"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-JfrR8W5wNVFJ","createdDate":1698332403845,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":true,"allowBulkInvocation":true,"sourceFilePath":"user/actions/signIn.js","triggers":{"Trigger-DlQymmTzzlV7":{"type":"Trigger","key":"Trigger-DlQymmTzzlV7","createdDate":1698332403846,"specID":"gadget/trigger/auth/signin","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-6M9Q80hLE1xZ","values":{}}},"Trigger-a_Q5Q06Ed-ke":{"type":"Trigger","key":"Trigger-a_Q5Q06Ed-ke","createdDate":1698332403846,"specID":"gadget/trigger/google_oauth/signin","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-q0Qng0hREe8c","values":{}}}},"customApiIdentifier":"signIn","timeout":"3 minutes"},"Action-N7dC6FvYDcZa":{"type":"Action","key":"Action-N7dC6FvYDcZa","createdDate":1698332403888,"name":"changePassword","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-dAoaSPIekKRI","createdDate":1698332403888,"effects":{"_map":{"Effect-Hhhdj_wEI_uc":{"type":"Effect","key":"Effect-Hhhdj_wEI_uc","createdDate":1698332403895,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-MWL1Hu-6MWDl","createdDate":1698332403894,"values":{"sourceFilePath":"user/actions/changePassword.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-Hhhdj_wEI_uc","_tail":"Effect-Hhhdj_wEI_uc"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-uYxeszplIuzy","createdDate":1698332403889,"effects":{"_map":{"Effect-3Jje7bRtAnR_":{"type":"Effect","key":"Effect-3Jje7bRtAnR_","createdDate":1698332403897,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-7URTuEo0OzGI","createdDate":1698332403896,"values":{"sourceFilePath":"user/actions/changePassword.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-3Jje7bRtAnR_","_tail":"Effect-3Jje7bRtAnR_"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-EVIsKWw7jAE5","createdDate":1698332403889,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":true,"allowBulkInvocation":true,"sourceFilePath":"user/actions/changePassword.js","triggers":{"Trigger-zbjbapeqRvLd":{"type":"Trigger","key":"Trigger-zbjbapeqRvLd","createdDate":1698332403890,"specID":"gadget/trigger/auth/change-password","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-WsqOwiZuY312","values":{}}}},"customApiIdentifier":"changePassword","timeout":"3 minutes"},"Action-NSyXsaYsV2gd":{"type":"Action","key":"Action-NSyXsaYsV2gd","createdDate":1698332403852,"name":"signOut","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-MV6Vy5DvHw3T","createdDate":1698332403852,"effects":{"_map":{"Effect-rQeGe13VD0G8":{"type":"Effect","key":"Effect-rQeGe13VD0G8","createdDate":1698332403855,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-aX0rlb7oRzrR","createdDate":1698332403855,"values":{"sourceFilePath":"user/actions/signOut.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-rQeGe13VD0G8","_tail":"Effect-rQeGe13VD0G8"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-lUB724kl8K6d","createdDate":1698332403852,"effects":{"_map":{"Effect-M_uySzxcRzF3":{"type":"Effect","key":"Effect-M_uySzxcRzF3","createdDate":1698332403856,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-bGdmgj6fyYU0","createdDate":1698332403856,"values":{"sourceFilePath":"user/actions/signOut.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-M_uySzxcRzF3","_tail":"Effect-M_uySzxcRzF3"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-TsMadlT9Tr98","createdDate":1698332403852,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":true,"allowBulkInvocation":true,"sourceFilePath":"user/actions/signOut.js","triggers":{"Trigger-nupkzHongISS":{"type":"Trigger","key":"Trigger-nupkzHongISS","createdDate":1698332403852,"specID":"gadget/trigger/graphql_api","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-ADOIA7gVK5i4","values":{}}}},"customApiIdentifier":"signOut","timeout":"3 minutes"},"Action-lVdCIkWKbVeB":{"type":"Action","key":"Action-lVdCIkWKbVeB","createdDate":1698332403858,"name":"sendVerifyEmail","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-KfxTwEiCwCZ9","createdDate":1698332403858,"effects":{"_map":{"Effect-oMEY5um6m_Jr":{"type":"Effect","key":"Effect-oMEY5um6m_Jr","createdDate":1698332403861,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-feQk1uU757ek","createdDate":1698332403861,"values":{"sourceFilePath":"user/actions/sendVerifyEmail.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-oMEY5um6m_Jr","_tail":"Effect-oMEY5um6m_Jr"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-Jz9Ve-7vDsYq","createdDate":1698332403858,"effects":{"_map":{"Effect-zxX96yeUwaUA":{"type":"Effect","key":"Effect-zxX96yeUwaUA","createdDate":1698332403862,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-RJvYGScsUSBJ","createdDate":1698332403862,"values":{"sourceFilePath":"user/actions/sendVerifyEmail.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-zxX96yeUwaUA","_tail":"Effect-zxX96yeUwaUA"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-GtBeGmn1-lyw","createdDate":1698332403858,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":true,"allowBulkInvocation":true,"sourceFilePath":"user/actions/sendVerifyEmail.js","triggers":{"Trigger-q6ITX9P2XMlY":{"type":"Trigger","key":"Trigger-q6ITX9P2XMlY","createdDate":1698332403859,"specID":"gadget/trigger/auth/send-verify-email","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-1JLsEe-uFKgm","values":{}}}},"customApiIdentifier":"sendVerifyEmail","timeout":"3 minutes"},"Action-pZ3Jp3MvEtH5":{"type":"Action","key":"Action-pZ3Jp3MvEtH5","createdDate":1698332403872,"name":"verifyEmail","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-Lm0KcWuGdFDz","createdDate":1698332403872,"effects":{"_map":{"Effect-Yu_kOdaGk5Gc":{"type":"Effect","key":"Effect-Yu_kOdaGk5Gc","createdDate":1698332403876,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-18wq4ZtCSQ0G","createdDate":1698332403875,"values":{"sourceFilePath":"user/actions/verifyEmail.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-Yu_kOdaGk5Gc","_tail":"Effect-Yu_kOdaGk5Gc"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-FWVVMW9prfCw","createdDate":1698332403873,"effects":{"_map":{"Effect-p8_X8i7TLNfM":{"type":"Effect","key":"Effect-p8_X8i7TLNfM","createdDate":1698332403877,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-hV6fg33qsDDx","createdDate":1698332403876,"values":{"sourceFilePath":"user/actions/verifyEmail.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-p8_X8i7TLNfM","_tail":"Effect-p8_X8i7TLNfM"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-rG7DA3HvZwhp","createdDate":1698332403873,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":true,"allowBulkInvocation":true,"sourceFilePath":"user/actions/verifyEmail.js","triggers":{"Trigger-_N0G2sDoQkRS":{"type":"Trigger","key":"Trigger-_N0G2sDoQkRS","createdDate":1698332403873,"specID":"gadget/trigger/auth/verify-email","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-MkuUaP3OjPf1","values":{}}}},"customApiIdentifier":"verifyEmail","timeout":"3 minutes"},"Action-xNaxrvwJyOyH":{"type":"Action","key":"Action-xNaxrvwJyOyH","createdDate":1698332403864,"name":"sendResetPassword","preconditions":[],"onRunEffects":{"type":"EffectList","key":"EffectList-WVgjVDP6wh7g","createdDate":1698332403864,"effects":{"_map":{"Effect-uXM2xQVei3hy":{"type":"Effect","key":"Effect-uXM2xQVei3hy","createdDate":1698332403870,"specID":"gadget/effect/actionRun","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-x6i_dXxTrB59","createdDate":1698332403869,"values":{"sourceFilePath":"user/actions/sendResetPassword.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-uXM2xQVei3hy","_tail":"Effect-uXM2xQVei3hy"},"transactional":true},"onSuccessEffects":{"type":"EffectList","key":"EffectList-lbk4Zg1Z4HjW","createdDate":1698332403864,"effects":{"_map":{"Effect-SkZxNm-T9hZT":{"type":"Effect","key":"Effect-SkZxNm-T9hZT","createdDate":1698332403871,"specID":"gadget/effect/actionOnSuccess","configuration":{"type":"EffectConfiguration","key":"EffectConfiguration-crycW1tYklSA","createdDate":1698332403871,"values":{"sourceFilePath":"user/actions/sendResetPassword.js"}},"order":"a0"}},"_orderKeys":{"a0":true},"_head":"Effect-SkZxNm-T9hZT","_tail":"Effect-SkZxNm-T9hZT"},"transactional":false},"onFailureEffects":{"type":"EffectList","key":"EffectList-YWeI5TqVKXRK","createdDate":1698332403864,"effects":{"_map":{},"_orderKeys":{}},"transactional":false},"allowActionDeletion":true,"allowBulkInvocation":true,"sourceFilePath":"user/actions/sendResetPassword.js","triggers":{"Trigger-eN8tougGuOnr":{"type":"Trigger","key":"Trigger-eN8tougGuOnr","createdDate":1698332403865,"specID":"gadget/trigger/auth/send-reset-password","configuration":{"type":"UnstructuredTriggerConfiguration","key":"UnstructuredTriggerConfiguration-N0bXJGlrbBQp","values":{}}}},"customApiIdentifier":"sendResetPassword","timeout":"3 minutes"}},"transitions":{"qdZVJq35dA_t":{"type":"Transition","key":"qdZVJq35dA_t","createdDate":1698332403787,"action":"IwXWpbWgikyR","fromAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"BOTTOM","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"8xEuJl1UV_V0","edge":"TOP","normalizedPosition":0.5}}},"rQZ8oWhqewsR":{"type":"Transition","key":"rQZ8oWhqewsR","createdDate":1698332403787,"action":"S8WnqiL0dys3","fromAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"RIGHT","normalizedPosition":0.5}}},"Transition-4GBXkGnYfxBb":{"type":"Transition","key":"Transition-4GBXkGnYfxBb","createdDate":1698332403857,"action":"Action-NSyXsaYsV2gd","fromAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"RIGHT","normalizedPosition":0.5}}},"Transition-DGjbf7blLlox":{"type":"Transition","key":"Transition-DGjbf7blLlox","createdDate":1698332403877,"action":"Action-pZ3Jp3MvEtH5","fromAnchor":{"destination":{"type":"state-edge","state":"qEhGEbSppe4Q","edge":"BOTTOM","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}}},"Transition-Nij4FmHR7_ay":{"type":"Transition","key":"Transition-Nij4FmHR7_ay","createdDate":1698332403898,"action":"Action-N7dC6FvYDcZa","fromAnchor":{"destination":{"type":"state-edge","state":"qEhGEbSppe4Q","edge":"BOTTOM","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}}},"Transition-SB6wsq5bZ0pp":{"type":"Transition","key":"Transition-SB6wsq5bZ0pp","createdDate":1698332403863,"action":"Action-lVdCIkWKbVeB","fromAnchor":{"destination":{"type":"state-edge","state":"qEhGEbSppe4Q","edge":"BOTTOM","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}}},"Transition-VjA7K9335itP":{"type":"Transition","key":"Transition-VjA7K9335itP","createdDate":1698332403851,"action":"Action-HLQ_yGMw5kit","fromAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"RIGHT","normalizedPosition":0.5}}},"Transition-ahK92BgFxD0r":{"type":"Transition","key":"Transition-ahK92BgFxD0r","createdDate":1698332403887,"action":"Action-670SuQ__Vzfz","fromAnchor":{"destination":{"type":"state-edge","state":"qEhGEbSppe4Q","edge":"BOTTOM","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}}},"Transition-kT8P1lTbRxpp":{"type":"Transition","key":"Transition-kT8P1lTbRxpp","createdDate":1698332403843,"action":"Action-4gpeQoE4fCbf","fromAnchor":{"destination":{"type":"state-edge","state":"qEhGEbSppe4Q","edge":"BOTTOM","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}}},"Transition-tPxFi7w3BxbI":{"type":"Transition","key":"Transition-tPxFi7w3BxbI","createdDate":1698332403872,"action":"Action-xNaxrvwJyOyH","fromAnchor":{"destination":{"type":"state-edge","state":"qEhGEbSppe4Q","edge":"BOTTOM","normalizedPosition":0.5}},"toAnchor":{"destination":{"type":"state-edge","state":"yr0j2AnSS7ve","edge":"TOP","normalizedPosition":0.5}}}},"stateInActionCode":false}},"Session":{"key":"DataModel-nJ1AqaYw9rQb","name":"Session","apiIdentifier":"session","fields":{"ModelField-7bgzbJqNXFeh-system-id":{"fieldType":"ID","key":"ModelField-7bgzbJqNXFeh-system-id","name":"ID","apiIdentifier":"id","configuration":{"type":"IDConfig","key":"IDConfig-F9RvaTzpsQT8","createdDate":1698332403673},"internalWritable":true},"ModelField-1M897zHh9LqT-system-createdAt":{"fieldType":"DateTime","key":"ModelField-1M897zHh9LqT-system-createdAt","name":"Created At","apiIdentifier":"createdAt","configuration":{"type":"DateTimeConfig","key":"DateTimeConfig-5TukXw4AitLY","createdDate":1698332403674,"includeTime":true,"default":null},"internalWritable":true},"ModelField-RKKlu1j_KUQ--system-updatedAt":{"fieldType":"DateTime","key":"ModelField-RKKlu1j_KUQ--system-updatedAt","name":"Updated At","apiIdentifier":"updatedAt","configuration":{"type":"DateTimeConfig","key":"DateTimeConfig-xJgXH9w0woFP","createdDate":1698332403674,"includeTime":true,"default":null},"internalWritable":true},"ModelField-DataModel-nJ1AqaYw9rQb-system-state":{"fieldType":"RecordState","key":"ModelField-DataModel-nJ1AqaYw9rQb-system-state","name":"State","apiIdentifier":"state","configuration":{"type":"RecordStateConfig","key":"RecordStateConfig-CHATWOqg1paQ","createdDate":1698332403693},"internalWritable":true},"ModelField-isA_FYRLUIDn":{"fieldType":"BelongsTo","key":"ModelField-isA_FYRLUIDn","name":"User","apiIdentifier":"user","configuration":{"type":"BelongsToConfig","key":"BelongsToConfig-DVYbUWkOHHXW","createdDate":1698332403972,"relatedModelKey":"DataModel-jDYSRggNrhg_"},"internalWritable":true}},"graphqlTypeName":"Session","stateChart":{"childStates":[{"customApiIdentifier":null,"childStates":[],"type":"State","key":"State-jGC2yzCLEUb8","createdDate":1698332403699,"name":"Created","color":"#3280D6","isRecordBirthPlace":false,"isUndeleteableSystemState":false,"boxLayout":{"x":64,"y":64,"width":704,"height":384},"restoreHistory":true}],"initialChildState":"State-jGC2yzCLEUb8","type":"StateChart","key":"StateChart-ICEqeiXz84qU","createdDate":1698332403676,"actions":{},"transitions":{},"stateInActionCode":false}}};

/**
 * Internal variable to map model apiIdentifier to GraphQL typename in modelsMap.
 * @internal
 */
export const modelListIndex: Record<string, string> = {"api:user":"User","api:session":"Session"};
